import Booking from "../models/booking.model.js";
import Hub from "../models/storageHub.model.js";
import logger from "../config/logger.js";
import {
  sendBookingCancelledEmail,
  sendBookingCompletedEmail,
  sendBookingInStorageEmail,
} from "../lib/email.js";

export interface BookingLifecycleResult {
  expiredPending: number;
  movedToInStorage: number;
  completed: number;
}

interface LifecycleCandidate {
  _id: unknown;
  bookingId: string;
  fullName: string;
  email?: string;
  cropType: string;
  quantity: number;
  unitType: string;
  dropOffDate: Date;
  pickUpDate: Date;
  hub: { _id: unknown; name: string } | null;
}

const fetchCandidates = (
  filter: Record<string, unknown>,
): Promise<LifecycleCandidate[]> =>
  Booking.find(filter)
    .populate<{ hub: { _id: unknown; name: string } | null }>("hub", "name")
    .select(
      "_id bookingId fullName email cropType quantity unitType dropOffDate pickUpDate hub",
    )
    .lean() as unknown as Promise<LifecycleCandidate[]>;

// Advances bookings through their natural lifecycle based on today's date,
// relative to their drop-off/pick-up dates:
//   pending    -> cancelled   (drop-off date passed with no payment ever recorded)
//   confirmed  -> in_storage  (drop-off date has arrived)
//   in_storage -> completed   (pick-up date has passed, releases hub capacity)
// Nothing else in the codebase currently sets in_storage/completed, so this
// sweep is the only place those transitions happen. Each transition is
// claimed atomically (a plain findOneAndUpdate guarded by the expected
// current status) so an overlapping sweep, or an admin action racing the
// same booking, can't process the same booking twice.
export const advanceBookingLifecycle =
  async (): Promise<BookingLifecycleResult> => {
    const now = new Date();
    let expiredPending = 0;
    let movedToInStorage = 0;
    let completed = 0;

    // 1. pending -> cancelled: nobody paid before the drop-off date arrived.
    const stalePending = await fetchCandidates({
      bookingStatus: "pending",
      dropOffDate: { $lte: now },
    });
    for (const candidate of stalePending) {
      const claimed = await Booking.findOneAndUpdate(
        { _id: candidate._id, bookingStatus: "pending" },
        { $set: { bookingStatus: "cancelled" } },
      );
      if (!claimed) continue;
      expiredPending++;

      if (candidate.email) {
        sendBookingCancelledEmail(
          candidate.email,
          candidate.fullName || "AgroKeep Customer",
          candidate.bookingId,
          candidate.hub?.name ?? "your storage hub",
          candidate.cropType,
          candidate.quantity,
          candidate.unitType,
          candidate.dropOffDate,
          candidate.pickUpDate,
          "unpaid",
        ).catch((err) => {
          logger.error(
            "Failed to send stale-pending cancellation email:",
            err.message,
          );
        });
      }
    }

    // 2. confirmed -> in_storage: the drop-off date has arrived.
    const dueForStorage = await fetchCandidates({
      bookingStatus: "confirmed",
      dropOffDate: { $lte: now },
    });
    for (const candidate of dueForStorage) {
      const claimed = await Booking.findOneAndUpdate(
        { _id: candidate._id, bookingStatus: "confirmed" },
        { $set: { bookingStatus: "in_storage" } },
      );
      if (!claimed) continue;
      movedToInStorage++;

      if (candidate.email) {
        sendBookingInStorageEmail(
          candidate.email,
          candidate.fullName || "AgroKeep Customer",
          candidate.bookingId,
          candidate.hub?.name ?? "your storage hub",
          candidate.cropType,
          candidate.quantity,
          candidate.unitType,
          candidate.dropOffDate,
          candidate.pickUpDate,
        ).catch((err) => {
          logger.error("Failed to send in-storage email:", err.message);
        });
      }
    }

    // 3. in_storage -> completed: the pick-up date has passed. Releases the
    // hub capacity this booking was occupying.
    const dueForPickup = await fetchCandidates({
      bookingStatus: "in_storage",
      pickUpDate: { $lte: now },
    });
    for (const candidate of dueForPickup) {
      const claimed = await Booking.findOneAndUpdate(
        { _id: candidate._id, bookingStatus: "in_storage" },
        { $set: { bookingStatus: "completed" } },
      );
      if (!claimed) continue;
      completed++;

      if (candidate.hub?._id) {
        const releasedHub = await Hub.findByIdAndUpdate(candidate.hub._id, {
          $inc: { availableCapacity: candidate.quantity },
        });
        if (!releasedHub) {
          logger.warn(
            `Booking ${candidate.bookingId} completed but its hub (${candidate.hub._id}) no longer exists — capacity was not released`,
          );
        }
      } else {
        logger.warn(
          `Booking ${candidate.bookingId} completed but has no hub reference — capacity was not released`,
        );
      }

      if (candidate.email) {
        sendBookingCompletedEmail(
          candidate.email,
          candidate.fullName || "AgroKeep Customer",
          candidate.bookingId,
          candidate.hub?.name ?? "your storage hub",
          candidate.cropType,
          candidate.quantity,
          candidate.unitType,
          candidate.pickUpDate,
        ).catch((err) => {
          logger.error("Failed to send booking-completed email:", err.message);
        });
      }
    }

    return { expiredPending, movedToInStorage, completed };
  };
