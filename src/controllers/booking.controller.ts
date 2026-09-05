import { Request, Response } from "express";
import crypto from "crypto";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";
import Booking from "../models/booking.model.js";
import Hub from "../models/storageHub.model.js";
import { sendBookingCreatedEmail } from "../lib/email.js";
import logger from "../config/logger.js";
import { CreateBookingInput } from "../lib/schemaValidation.js";
import {
  calculateBookingPricing,
  calculateDurationInDays,
  isPricingError,
  normalizeUnitType,
  validateHubForBooking,
} from "../services/bookingPricing.service.js";
import { normalizeToCalendarDate } from "../lib/dateUtils.js";

// Helper function to generate custom Booking ID (e.g., AK-JFCX7L)
export const generateBookingId = (): string => {
  const randomStr = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `AK-${randomStr}`;
};

export const createBooking = tryCatchWrapper(
  async (req: Request<{}, {}, CreateBookingInput>, res: Response) => {
    const {
      hubId,
      selectedCrop,
      quantity,
      unitType,
      dropOffDate,
      pickUpDate,
      fullName,
      phoneNumber,
      email,
      specialInstructions,
    } = req.body;

    // Body is already validated (and quantity coerced to a positive number)
    // by the createBookingSchema middleware on this route.
    const requestedUnitType = normalizeUnitType(unitType);
    const userId = req.session?.userId;
    // Pin both dates to a specific calendar day so the lifecycle sweep's
    // date comparisons can't drift a day early/late depending on what
    // time-of-day/timezone the client happened to send.
    const normalizedDropOffDate = normalizeToCalendarDate(dropOffDate);
    const normalizedPickUpDate = normalizeToCalendarDate(pickUpDate);

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
    );
    if (isPricingError(pricingResult)) {
      return sendTsRestError(res, pricingResult.status, pricingResult.message);
    }
    const pricing = pricingResult;

    // 5. Create booking record
    const bookingId = generateBookingId();

    const booking = await Booking.create({
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
      bookingStatus: "pending",
      paymentStatus: "unpaid",
    });

    // 6. Send notification email
    const recipientEmail = booking.email || req.body.email;
    if (recipientEmail) {
      sendBookingCreatedEmail(
        recipientEmail,
        booking.fullName || "Agrokeep Customer",
        booking.bookingId,
        booking.cropType,
        booking.quantity,
        booking.unitType,
        booking.dropOffDate,
        booking.pickUpDate,
        booking.depositAmount,
        booking.totalAmount
      ).catch((err) => {
        logger.error("Failed to send booking creation email:", err.message);
      });
    } else {
      logger.warn(
        `Skipping booking creation email: No email provided for booking ${booking.bookingId}`
      );
    }

    return sendTsRestSuccess(res, 201, {
      message: "Booking initialized successfully",
      data: {
        booking,
        paymentSummary: {
          depositAmount: pricing.depositAmount,
          balanceAmount: pricing.balanceAmount,
          totalAmount: pricing.totalAmount,
          durationInDays: totalDays,
        },
      },
    });
  }
);

export const getMyBookings = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const userId = req.session.userId;

    if (!userId) {
      return sendTsRestError(
        res,
        401,
        "Unauthorized. Please log in to continue."
      );
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 5;
    const skip = (page - 1) * limit;
    const query = { user: userId };

    const [
      bookings,
      totalBookings,
      upcomingCount,
      activeCount,
      completedCount,
    ] = await Promise.all([
      Booking.find(query)
        .populate({
          path: "hub",
          select:
            "name slug lga address images state storageType isVerified operatingHours",
        })
        .populate({ path: "user", select: "fullName email phoneNumber" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Booking.countDocuments(query),
      Booking.countDocuments({ ...query, bookingStatus: "confirmed" }),
      Booking.countDocuments({ ...query, bookingStatus: "in_storage" }),
      Booking.countDocuments({ ...query, bookingStatus: "completed" }),
    ]);

    const metrics = {
      upcoming: upcomingCount,
      active: activeCount,
      completed: completedCount,
    };

    return sendTsRestSuccess(res, 200, {
      success: true,
      message:
        bookings.length > 0
          ? "Bookings retrieved successfully"
          : "No bookings found",
      data: {
        bookings,
        metrics,
        pagination: {
          total: totalBookings,
          currentPage: page,
          totalPages: Math.ceil(totalBookings / limit),
          hasNextPage: page * limit < totalBookings,
          hasPrevPage: page > 1,
        },
      },
    });
  }
);

export const getSingleBooking = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    if (!id) {
      return sendTsRestError(res, 400, "Booking ID is required");
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const query = isObjectId ? { _id: id } : { bookingId: id.toUpperCase() };

    const booking = await Booking.findOne(query)
      .populate({
        path: "hub",
        select:
          "name slug state lga address storageType isVerified operatingHours images description",
      })
      .populate({
        path: "user",
        select: "fullName email phoneNumber",
      })
      .lean();

    if (!booking) {
      return sendTsRestError(res, 404, "Booking not found");
    }

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: "Booking retrieved successfully",
      data: { booking },
    });
  }
);