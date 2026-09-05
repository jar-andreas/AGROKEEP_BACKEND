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
import { sendAdminBookingCreatedEmail } from "../lib/email.js";
import logger from "../config/logger.js";

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
      filter.bookingStatus = status.toLowerCase();
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

    const hub = await Hub.findById(hubId);
    if (!hub) {
      return sendTsRestError(res, 404, "Storage Hub not found");
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

    const totalDays = calculateDurationInDays(dropOffDate, pickUpDate);
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
    // Admin is recording a payment already collected offline, so the booking
    // is created as paid rather than "unpaid" (the default for the public,
    // Paystack-driven flow in booking.controller.ts).
    const paymentStatus =
      paymentType === "full" ? "fully_paid" : "partial_deposit_paid";

    const booking = await Booking.create({
      bookingId,
      hub: hub._id,
      user: userId || null,
      cropType: selectedCrop,
      quantity,
      unitType: requestedUnitType,
      dropOffDate: new Date(dropOffDate),
      pickUpDate: new Date(pickUpDate),
      durationInDays: totalDays,
      fullName,
      phoneNumber,
      email: email || undefined,
      specialInstructions: specialInstructions || undefined,
      ...pricing,
      bookingStatus: bookingStatus || "confirmed",
      paymentStatus,
    });

    const payment = await Payment.create({
      user: userId || undefined,
      booking: booking._id,
      hub: hub._id,
      reference: generateAdminPaymentReference(),
      paymentMethod: "cash",
      paymentType,
      amount: pricing.depositAmount,
      status: "success",
      paidAt: new Date(),
    });

    booking.paymentReference = payment.reference;
    await booking.save();

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

export const cancelBookingAdmin = tryCatchWrapper(
  async (req: Request<SingleBookingParamsInput>, res: Response) => {
    const { id } = req.params;

    const booking = await Booking.findById(id);
    if (!booking) {
      return sendTsRestError(res, 404, "Booking not found");
    }

    // Cancellation is only meaningful before the produce has actually arrived.
    // Once storage has started (or the booking is already at a terminal
    // status) it can no longer be plainly cancelled.
    const CANCELLABLE_STATUSES = ["pending", "confirmed"];
    if (!CANCELLABLE_STATUSES.includes(booking.bookingStatus)) {
      return sendTsRestError(
        res,
        400,
        `This booking cannot be cancelled because it is already "${booking.bookingStatus}". Only pending or confirmed bookings can be cancelled.`,
      );
    }

    booking.bookingStatus = "cancelled";
    await booking.save();

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: "Booking cancelled successfully",
      data: {
        booking,
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
