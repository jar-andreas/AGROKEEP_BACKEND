import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";
import Booking from "../models/booking.model.js";
import Hub from "../models/storageHub.model.js";
import { sendBookingCreatedEmail } from "../lib/email.js";
import logger from "../config/logger.js";

// Helper function to generate custom Booking ID (e.g., AK-JFCX7L)
const generateBookingId = (): string => {
  const randomStr = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `AK-${randomStr}`;
};

export const createBooking = tryCatchWrapper(
  async (req: Request, res: Response) => {
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

    const qty = Number(quantity);

    const userId = req.session.userId;

    // 1. Verify storage hub
    const hub = await Hub.findById(hubId);
    if (!hub) {
      return sendTsRestError(res, 404, "Storage Hub not found");
    }

    // Validate available capacity
    if (qty > hub.availableCapacity) {
      return sendTsRestError(
        res,
        400,
        `Requested quantity (${qty}) exceeds available hub capacity (${hub.availableCapacity})`,
      );
    }

    // 2. Validate Supported Crop
    const isCropSupported = hub.supportedCrops.some(
      (crop: string) => crop.toLowerCase() === selectedCrop.toLowerCase(),
    );

    if (!isCropSupported) {
      return sendTsRestError(
        res,
        400,
        `This storage hub does not support "${selectedCrop}". Supported crops: ${hub.supportedCrops.join(", ")}`,
      );
    }

    // 2b. Validate Unit Type compatibility with Hub
    if (hub.unitType.toLowerCase() !== unitType.toLowerCase()) {
      return sendTsRestError(
        res,
        400,
        `This storage facility only supports "${hub.unitType}" storage. You selected "${unitType}".`,
      );
    }

    // 3. Calculate duration in days directly from dates
    const start = new Date(dropOffDate).getTime();
    const end = new Date(pickUpDate).getTime();
    const diffTime = end - start;
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (totalDays < 1) {
      return sendTsRestError(
        res,
        400,
        "Pick-up date must be at least 1 day after drop-off date",
      );
    }

    // 4. Calculate pricing
    const isCrate = unitType === "crates";
    const isBulk = qty >= 100;
    const isWeekly = totalDays >= 7 && totalDays % 7 === 0 && !isBulk;

    let dailyPricePerUnit = 0;
    let storageFee = 0;

    // Tier 1: Weekly Flat Rate (7-day multiples under 100 units)
    if (isWeekly && hub.priceWeeklyFlat > 0) {
      const weeks = totalDays / 7;
      storageFee = weeks * hub.priceWeeklyFlat;
      dailyPricePerUnit = parseFloat(
        (hub.priceWeeklyFlat / (7 * qty)).toFixed(2),
      );
    }
    // Tier 2: Bulk Daily Rate (100+ units)
    else if (isBulk && hub.priceDailyBulk100Plus > 0) {
      dailyPricePerUnit = hub.priceDailyBulk100Plus;
      storageFee = totalDays * hub.priceDailyBulk100Plus;
    }
    // Tier 3: Standard Crate Daily Rate
    else if (isCrate) {
      if (!hub.pricePerCratePerDay50kg || hub.pricePerCratePerDay50kg <= 0) {
        return sendTsRestError(
          res,
          400,
          "This facility does not offer crate storage",
        );
      }
      dailyPricePerUnit = hub.pricePerCratePerDay50kg;
      storageFee = Math.round(dailyPricePerUnit * qty * totalDays);
    }
    // Tier 4: Standard Bag Daily Rate
    else {
      if (!hub.pricePerBagPerDay50kg || hub.pricePerBagPerDay50kg <= 0) {
        return sendTsRestError(
          res,
          400,
          "This facility does not offer bag storage",
        );
      }
      dailyPricePerUnit = hub.pricePerBagPerDay50kg;
      storageFee = Math.round(dailyPricePerUnit * qty * totalDays);
    }

    // Service fee and deposit breakdown
    const serviceFee = 5000;
    const totalAmount = storageFee + serviceFee;
    const depositAmount = Math.round(totalAmount * 0.3); // 30% deposit
    const balanceAmount = totalAmount - depositAmount;

    // 5. Create booking record
    const bookingId = generateBookingId();

    const booking = await Booking.create({
      bookingId,
      hub: hub._id,
      user: userId || null,
      cropType: selectedCrop,
      quantity: qty,
      unitType: unitType || "bags",
      dropOffDate: new Date(dropOffDate),
      pickUpDate: new Date(pickUpDate),
      durationInDays: totalDays,
      fullName,
      phoneNumber,
      email: email || undefined,
      specialInstructions: specialInstructions || undefined,
      dailyPricePerUnit: parseFloat(dailyPricePerUnit.toFixed(2)),
      storageFee,
      serviceFee,
      totalAmount,
      depositAmount,
      balanceAmount,
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
        booking.totalAmount,
      ).catch((err) => {
        logger.error("Failed to send booking creation email:", err.message);
      });
    } else {
      logger.warn(
        `Skipping booking creation email: No email provided for booking ${booking.bookingId}`,
      );
    }

    return sendTsRestSuccess(res, 201, {
      message: "Booking initialized successfully",
      data: {
        booking,
        paymentSummary: {
          depositAmount,
          balanceAmount,
          totalAmount,
          durationInDays: totalDays,
        },
      },
    });
  },
);

export const getMyBookings = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const userId = req.session.userId;

    if (!userId) {
      return sendTsRestError(
        res,
        401,
        "Unauthorized. Please log in to continue.",
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
  },
);

export const getSingleBooking = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    if (!id) {
      return sendTsRestError(res, 400, "Booking ID is required");
    }

    // Support both 24-char Mongo ObjectIds and custom IDs (e.g. AK-JFCX7K)
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
  },
);
