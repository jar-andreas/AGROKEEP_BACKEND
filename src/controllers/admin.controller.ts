import mongoose from "mongoose";
import User from "../models/user.model.js";
import crypto from "crypto";
import {
  AdminAllBookingsQuery,
  AdminCreateBookingInput,
  SingleBookingParamsInput,
} from "../lib/schemaValidation.js";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { Request, Response } from "express";
import Hub from "../models/storageHub.model.js";
import Booking from "../models/booking.model.js";
import Payment from "../models/payment.model.js";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";
import { generateBookingId } from "./booking.controller.js";
import {
  calculateBookingPricing,
  calculateDurationInDays,
  isPricingError,
  normalizeUnitType,
  validateHubForBooking,
} from "../services/bookingPricing.service.js";
import {
  sendAdminBookingCreatedEmail,
  sendBookingCancelledEmail,
} from "../lib/email.js";
import { normalizeToCalendarDate } from "../lib/dateUtils.js";
import logger from "../config/logger.js";

// The frontend's Status filter shows "Active" for a booking whose produce is
// currently in storage — but bookingStatus itself only ever stores the real
// enum value ("in_storage"), never "active". Accept the display label as an
// alias so the filter still works regardless of which one the client sends.
const BOOKING_STATUS_ALIASES: Record<string, string> = {
  active: "in_storage",
};

const resolveBookingStatusFilter = (status: string): string => {
  const normalized = status.toLowerCase();
  return BOOKING_STATUS_ALIASES[normalized] ?? normalized;
};

export const getAllBookingsAdmin = tryCatchWrapper(
  async (req: Request<{}, {}, {}, AdminAllBookingsQuery>, res: Response) => {
    const {
      search,
      status,
      state,
      storageHub,
      cropType,
      paymentStatus,
      startDate,
      endDate,
    } = req.query;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};

    // 1. Text Search Across Booking ID, Customer (fullName/email/user), or Storage Hub Name
    if (search) {
      const searchRegex = new RegExp(search, "i");

      // Find matching User and Hub IDs for search query
      const [matchingUsers, matchingHubs] = await Promise.all([
        User.find({
          $or: [{ fullName: searchRegex }, { email: searchRegex }],
        }).select("_id"),
        Hub.find({ name: searchRegex }).select("_id"),
      ]);

      filter.$or = [
        { bookingId: searchRegex },
        { fullName: searchRegex },
        { email: searchRegex },
        { user: { $in: matchingUsers.map((u) => u._id) } },
        { hub: { $in: matchingHubs.map((h) => h._id) } },
      ];
    }

    // 2. Exact Dropdown Filters
    if (status && status !== "All Statuses") {
      filter.bookingStatus = resolveBookingStatusFilter(status);
    }

    if (cropType && cropType !== "All Crop Types") {
      filter.cropType = { $regex: new RegExp(`^${cropType}$`, "i") };
    }

    if (paymentStatus && paymentStatus !== "All Statuses") {
      filter.paymentStatus = paymentStatus.toLowerCase();
    }

    // 3. Storage Hub & State Filter Integration (Prevents Overwriting)
    if (storageHub && storageHub !== "All Storage Hubs") {
      filter.hub = storageHub;
    } else if (state && state !== "All States") {
      const matchingStateHubs = await Hub.find({
        state: { $regex: new RegExp(`^${state}$`, "i") },
      }).select("_id");

      filter.hub = { $in: matchingStateHubs.map((h) => h._id) };
    }

    // 4. Date Range Filtering (Full-day inclusion)
    if (startDate || endDate) {
      filter.dropOffDate = {};
      if (startDate) filter.dropOffDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.dropOffDate.$lte = end;
      }
    }

    // 5. Database Queries
    const [bookings, totalBookings] = await Promise.all([
      Booking.find(filter)
        .populate({
          path: "hub",
          select: "name slug state lga address",
        })
        .populate({
          path: "user",
          select: "fullName email phoneNumber",
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Booking.countDocuments(filter),
    ]);

    return sendTsRestSuccess(res, 200, {
      success: true,
      message:
        bookings.length > 0
          ? "Admin bookings retrieved successfully"
          : "No bookings matching criteria",
      data: {
        bookings,
        pagination: {
          total: totalBookings,
          currentPage: page,
          totalPages: Math.ceil(totalBookings / limit),
          hasNextPage: page * limit < totalBookings,
          hasPrevPage: page > 1,
          limit,
        },
      },
    });
  },
);

// controllers/booking.controller.ts

// Reference for a payment the admin is recording as already collected offline
// (cash/bank transfer), as opposed to a Paystack-issued reference.
const generateAdminPaymentReference = (): string =>
  `ADM-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

// Thrown inside the create-booking transaction to abort it cleanly when the
// atomic capacity reservation loses a race — distinguished from unexpected
// errors so the outer catch can turn it into a friendly 400.
class CapacityConflictError extends Error {}

export const adminCreateBooking = tryCatchWrapper(
  async (req: Request<{}, {}, AdminCreateBookingInput>, res: Response) => {
    const {
      hubId,
      userId,
      fullName,
      email,
      phoneNumber,
      selectedCrop,
      quantity,
      unitType,
      dropOffDate,
      pickUpDate,
      specialInstructions,
      bookingStatus,
      paymentType,
    } = req.body;

    // Body is already validated (and quantity coerced to a positive number)
    // by the AdminCreateBookingSchema middleware on this route.
    const requestedUnitType = normalizeUnitType(unitType);
    // Pin both dates to a specific calendar day so the lifecycle sweep's
    // date comparisons can't drift a day early/late depending on what
    // time-of-day/timezone the client happened to send.
    const normalizedDropOffDate = normalizeToCalendarDate(dropOffDate);
    const normalizedPickUpDate = normalizeToCalendarDate(pickUpDate);

    const hub = await Hub.findById(hubId);
    if (!hub) {
      return sendTsRestError(res, 404, "Storage Hub not found");
    }

    if (userId) {
      const referencedUser = await User.findById(userId).select("_id");
      if (!referencedUser) {
        return sendTsRestError(
          res,
          404,
          "The selected existing farmer account could not be found",
        );
      }
    }

    const validationError = validateHubForBooking(
      hub,
      quantity,
      selectedCrop,
      requestedUnitType,
    );
    if (validationError) {
      return sendTsRestError(
        res,
        validationError.status,
        validationError.message,
      );
    }

    const totalDays = calculateDurationInDays(
      normalizedDropOffDate,
      normalizedPickUpDate,
    );
    if (totalDays < 1) {
      return sendTsRestError(
        res,
        400,
        "Pick-up date must be at least 1 day after drop-off date",
      );
    }

    const pricingResult = calculateBookingPricing(
      hub,
      quantity,
      requestedUnitType,
      totalDays,
      paymentType,
    );
    if (isPricingError(pricingResult)) {
      return sendTsRestError(res, pricingResult.status, pricingResult.message);
    }
    const pricing = pricingResult;

    const bookingId = generateBookingId();
    const resolvedBookingStatus = bookingStatus || "confirmed";
    // Admin is recording a payment already collected offline, so the booking
    // is created as paid rather than "unpaid" (the default for the public,
    // Paystack-driven flow in booking.controller.ts).
    const paymentStatus =
      paymentType === "full" ? "fully_paid" : "partial_deposit_paid";

    // Reserving capacity, creating the booking, creating its payment record,
    // and linking the two together must all succeed or all fail as one unit
    // — otherwise a mid-sequence failure (e.g. a bookingId collision) could
    // leave capacity permanently deducted with no booking behind it, or a
    // booking marked "paid" with no Payment document backing it up.
    const session = await mongoose.startSession();
    let booking: any;
    let payment: any;

    try {
      await session.withTransaction(async () => {
        // A "confirmed" booking occupies real hub capacity, so reserve it
        // now — atomically, so two admins can't both book the last of the
        // same slot. A "pending" booking (rare from this endpoint — the
        // modal has no status picker) doesn't reserve capacity, mirroring
        // the public flow where capacity is only deducted once payment
        // confirms the booking.
        if (resolvedBookingStatus !== "pending") {
          const reservedHub = await Hub.findOneAndUpdate(
            { _id: hub._id, availableCapacity: { $gte: quantity } },
            { $inc: { availableCapacity: -quantity } },
            { new: true, session },
          );
          if (!reservedHub) {
            throw new CapacityConflictError(
              `Requested quantity (${quantity}) exceeds available hub capacity (${hub.availableCapacity})`,
            );
          }
        }

        const [createdBooking] = await Booking.create(
          [
            {
              bookingId,
              hub: hub._id,
              user: userId || null,
              cropType: selectedCrop,
              quantity,
              unitType: requestedUnitType,
              dropOffDate: normalizedDropOffDate,
              pickUpDate: normalizedPickUpDate,
              durationInDays: totalDays,
              fullName,
              phoneNumber,
              email: email || undefined,
              specialInstructions: specialInstructions || undefined,
              ...pricing,
              bookingStatus: resolvedBookingStatus,
              paymentStatus,
            },
          ],
          { session },
        );

        const [createdPayment] = await Payment.create(
          [
            {
              user: userId || undefined,
              booking: createdBooking._id,
              hub: hub._id,
              reference: generateAdminPaymentReference(),
              paymentMethod: "cash",
              paymentType,
              amount: pricing.depositAmount,
              status: "success",
              paidAt: new Date(),
            },
          ],
          { session },
        );

        createdBooking.paymentReference = createdPayment.reference;
        await createdBooking.save({ session });

        booking = createdBooking;
        payment = createdPayment;
      });
    } catch (error) {
      if (error instanceof CapacityConflictError) {
        return sendTsRestError(res, 400, error.message);
      }
      throw error;
    } finally {
      await session.endSession();
    }

    const recipientEmail = booking.email;
    if (recipientEmail) {
      sendAdminBookingCreatedEmail(
        recipientEmail,
        booking.fullName || "AgroKeep Customer",
        booking.bookingId,
        hub.name,
        booking.cropType,
        booking.quantity,
        booking.unitType,
        booking.dropOffDate,
        booking.pickUpDate,
        booking.totalAmount,
        booking.depositAmount,
        booking.balanceAmount,
        paymentType,
      ).catch((err) => {
        logger.error(
          "Failed to send admin-created booking email:",
          err.message,
        );
      });
    } else {
      logger.warn(
        `Skipping admin booking creation email: No email provided for booking ${booking.bookingId}`,
      );
    }

    return sendTsRestSuccess(res, 201, {
      success: true,
      message: "Admin booking created successfully",
      data: {
        booking,
        payment,
      },
    });
  },
);

// Cancellation is only meaningful before the produce has actually arrived.
// Once storage has started (or the booking is already at a terminal status)
// it can no longer be plainly cancelled.
const CANCELLABLE_STATUSES = ["pending", "confirmed"];
const PAID_STATUSES = ["partial_deposit_paid", "fully_paid"];

export const cancelBookingAdmin = tryCatchWrapper(
  async (req: Request<SingleBookingParamsInput>, res: Response) => {
    const { id } = req.params;

    const session = await mongoose.startSession();
    // Holds the booking as it was *before* cancellation — the atomic query
    // below only matches (and only returns a document) if the booking was
    // actually still pending/confirmed at write time, which is also how we
    // know whether capacity/a refund needs to be released for it.
    let previousBooking: any = null;

    try {
      await session.withTransaction(async () => {
        // A single atomic update, guarded by status at write time — this is
        // what stops two overlapping cancel requests (or a cancel racing the
        // lifecycle cron's confirmed->in_storage sweep) from both reading
        // "confirmed" and both crediting capacity back.
        previousBooking = await Booking.findOneAndUpdate(
          { _id: id, bookingStatus: { $in: CANCELLABLE_STATUSES } },
          [
            {
              $set: {
                bookingStatus: "cancelled",
                paymentStatus: {
                  $cond: [
                    { $in: ["$paymentStatus", PAID_STATUSES] },
                    "refund_required",
                    "$paymentStatus",
                  ],
                },
              },
            },
          ],
          { new: false, session },
        ).populate<{
          hub: { _id: InstanceType<typeof Hub>["_id"]; name: string };
        }>("hub", "name");

        if (!previousBooking) {
          return;
        }

        const hadCapacityReserved = previousBooking.bookingStatus === "confirmed";
        if (hadCapacityReserved) {
          await Hub.findByIdAndUpdate(
            previousBooking.hub._id,
            { $inc: { availableCapacity: previousBooking.quantity } },
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }

    if (!previousBooking) {
      const existing = await Booking.findById(id).select("bookingStatus").lean();
      if (!existing) {
        return sendTsRestError(res, 404, "Booking not found");
      }
      return sendTsRestError(
        res,
        400,
        `This booking cannot be cancelled because it is already "${existing.bookingStatus}". Only pending or confirmed bookings can be cancelled.`,
      );
    }

    const hadPayment = PAID_STATUSES.includes(previousBooking.paymentStatus);
    const finalPaymentStatus = hadPayment
      ? "refund_required"
      : previousBooking.paymentStatus;

    if (previousBooking.email) {
      sendBookingCancelledEmail(
        previousBooking.email,
        previousBooking.fullName || "AgroKeep Customer",
        previousBooking.bookingId,
        previousBooking.hub?.name ?? "your storage hub",
        previousBooking.cropType,
        previousBooking.quantity,
        previousBooking.unitType,
        previousBooking.dropOffDate,
        previousBooking.pickUpDate,
        finalPaymentStatus,
      ).catch((err) => {
        logger.error("Failed to send booking cancellation email:", err.message);
      });
    } else {
      logger.warn(
        `Skipping booking cancellation email: No email on file for booking ${previousBooking.bookingId}`,
      );
    }

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: "Booking cancelled successfully",
      data: {
        booking: {
          ...previousBooking.toObject(),
          bookingStatus: "cancelled",
          paymentStatus: finalPaymentStatus,
        },
      },
    });
  },
);

export const getSingleBookingAdmin = tryCatchWrapper(
  async (req: Request<SingleBookingParamsInput>, res: Response) => {
    const { id } = req.params;

    // Fetch booking details & populate Hub and User info
    const booking = await Booking.findById(id)
      .populate<{
        hub: {
          name: string;
          state: string;
          lga: string;
          address: string;
        };
      }>("hub", "name state lga address")
      .populate<{
        user: {
          _id: InstanceType<typeof Booking>["_id"];
          fullName: string;
          email: string;
          phoneNumber: string;
        };
      }>("user", "fullName email phoneNumber");

    if (!booking) {
      return sendTsRestError(res, 404, "Booking not found");
    }

    // Fetch associated payment details
    const paymentDetails = await Payment.findOne({
      booking: booking._id,
    }).lean();

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: "Booking details retrieved successfully",
      data: {
        booking: {
          id: booking._id,
          bookingCustomId: booking.bookingId, // AGK-004582
          bookingStatus: booking.bookingStatus,

          // Reservation Summary Card
          reservationSummary: {
            hubName: booking.hub?.name ?? "N/A",
            location: `${booking.hub?.lga ?? ""}, ${booking.hub?.state ?? ""}`
              .trim()
              .replace(/^,|,$/g, ""),
            crop: booking.cropType,
            quantity: booking.quantity,
            unitType: booking.unitType,
            dropOffDate: booking.dropOffDate,
            pickUpDate: booking.pickUpDate,
            durationInDays: booking.durationInDays,
            durationInWeeks: Math.ceil(booking.durationInDays / 7),
            totalAmount: booking.totalAmount,
          },

          // Farmer Card
          farmer: {
            userId: booking.user?._id ?? null,
            fullName: booking.fullName || booking.user?.fullName || "N/A",
            phoneNumber:
              booking.phoneNumber || booking.user?.phoneNumber || "N/A",
            email: booking.email || booking.user?.email || "N/A",
          },

          // Price Breakdown Card
          priceBreakdown: {
            cropType: booking.cropType,
            dailyPricePerUnit: booking.dailyPricePerUnit,
            durationInDays: booking.durationInDays,
            quantity: booking.quantity,
            unitType: booking.unitType,
            storageFee: booking.storageFee,
            serviceFee: booking.serviceFee,
            totalAmount: booking.totalAmount,
            depositAmount: booking.depositAmount,
            balanceAmount: booking.balanceAmount,
          },

          // Payment Card
          payment: {
            method: paymentDetails?.paymentMethod ?? "Debit Card",
            reference:
              paymentDetails?.reference ?? booking.paymentReference ?? "N/A",
            paidAt: paymentDetails?.createdAt ?? booking.updatedAt,
            status: paymentDetails?.status ?? booking.paymentStatus ?? "unpaid",
          },

          // Timeline History Card
          timeline: booking.timeline?.length
            ? booking.timeline
            : [
                {
                  title: "Booking created",
                  timestamp: booking.createdAt,
                },
                {
                  title: `30% Deposit - ₦${booking.depositAmount?.toLocaleString()} received`,
                  timestamp: booking.createdAt,
                },
                {
                  title: "Booking Confirmed",
                  timestamp: booking.updatedAt,
                },
              ],
        },
      },
    });
  },
);

export const getRefundsQueueAdmin = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { paymentStatus: "refund_required" };

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate({ path: "hub", select: "name slug state lga address" })
        .populate({ path: "user", select: "fullName email phoneNumber" })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Booking.countDocuments(filter),
    ]);

    // Attach each booking's payment record (method/reference/amount) so the
    // admin can see what to actually refund without a second lookup per row.
    const payments = await Payment.find({
      booking: { $in: bookings.map((b) => b._id) },
    }).lean();
    const paymentByBooking = new Map(
      payments.map((p) => [String(p.booking), p]),
    );

    const refunds = bookings.map((booking) => ({
      booking,
      payment: paymentByBooking.get(String(booking._id)) ?? null,
    }));

    return sendTsRestSuccess(res, 200, {
      success: true,
      message:
        refunds.length > 0
          ? "Refund queue retrieved successfully"
          : "No refunds currently pending",
      data: {
        refunds,
        pagination: {
          total,
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
          limit,
        },
      },
    });
  },
);

export const completeRefundAdmin = tryCatchWrapper(
  async (req: Request<SingleBookingParamsInput>, res: Response) => {
    const { id } = req.params;

    // Atomic, status-guarded update — same reasoning as cancelBookingAdmin:
    // only a booking that's actually still queued for refund can be marked
    // refunded, and only one concurrent request can win the transition.
    const booking = await Booking.findOneAndUpdate(
      { _id: id, paymentStatus: "refund_required" },
      { $set: { paymentStatus: "refunded" } },
      { new: true },
    );

    if (!booking) {
      const existing = await Booking.findById(id)
        .select("paymentStatus")
        .lean();
      if (!existing) {
        return sendTsRestError(res, 404, "Booking not found");
      }
      return sendTsRestError(
        res,
        400,
        `This booking isn't queued for a refund (its payment status is "${existing.paymentStatus}").`,
      );
    }

    await Payment.updateMany(
      { booking: booking._id },
      { $set: { status: "refunded" } },
    );

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: "Refund marked as completed",
      data: {
        booking,
      },
    });
  },
);
