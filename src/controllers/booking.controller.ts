import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";
import Booking from "../models/booking.model.js";
import Hub from "../models/storageHub.model.js";
import { sendBookingCreatedEmail } from "../lib/email.js";
import logger from "../config/logger.js";

//Helper function to generate custom Booking ID (e.g., AK-JFCX7L)

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
      durationInDays,
      durationInWeeks,
      fullName,
      phoneNumber,
      email,
      specialInstructions,
    } = req.body;

    const userId =
      (req.session as any)?.user?._id || (req.session as any)?.userId; //Optional if guest booking

    // Verify storage hub
    const hub = await Hub.findById(hubId);
    if (!hub) {
      return sendTsRestError(res, 404, "Storage Hub not found");
    }
    //Validate available capacity
    if (quantity > hub.availableCapacity) {
      return sendTsRestError(
        res,
        400,
        `Requested quantity (${quantity}) exceeds available hub capacity (${hub.availableCapacity})`,
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

    // 3. SERVER-SIDE CALCULATION (Prevents client-side price tampering)
    const totalDays = durationInDays
      ? Number(durationInDays)
      : Number(durationInWeeks) * 7;

    if (!totalDays || totalDays < 1) {
      return sendTsRestError(res, 400, "Please provide a valid duration");
    }

    //calculate pricing

    const isCrate = unitType === "crates";
    const isBulk = Number(quantity) >= 100;

    let weeklyRatePerUnit = hub.pricePerBagPerWeek50kg;

    if (isCrate) {
      if (!hub.pricePerCratePerWeek50kg || hub.pricePerCratePerWeek50kg <= 0) {
        return sendTsRestError(
          res,
          400,
          "This facility does not offer crate storage",
        );
      }
      weeklyRatePerUnit = hub.pricePerCratePerWeek50kg;
    } else if (isBulk && hub.priceWeeklyBulk100Plus > 0) {
      //apply bulk discount rate
      weeklyRatePerUnit = hub.priceWeeklyBulk100Plus;
    }

    //convert weekly rate to pro rated daily rate per bag
    const dailyPricePerUnit = weeklyRatePerUnit / 7;

    //Total Base Storage Fee
    const storageFee = Math.round(
      dailyPricePerUnit * Number(quantity) * totalDays,
    );

    //service fee and deposit breakdown
    const serviceFee = 5000;
    const totalAmount = storageFee + serviceFee;
    const depositAmount = Math.round(totalAmount * 0.3); // 30% deposit required immediately

    const balanceAmount = totalAmount - depositAmount;

    //creating booking record
    const bookingId = generateBookingId();

    const booking = await Booking.create({
      bookingId,
      hub: hub._id,
      user: userId || null,
      cropType: selectedCrop,
      quantity: Number(quantity),
      unitType: unitType || "bags",
      dropOffDate: new Date(dropOffDate),
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
    const recipientEmail = booking.email || req.body.email;
    if (recipientEmail) {
      sendBookingCreatedEmail(
        booking.email,
        booking.fullName || "Agrokeep Customer",
        booking.bookingId,
        booking.cropType,
        booking.quantity,
        booking.unitType,
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
        },
      },
    });
  },
);
