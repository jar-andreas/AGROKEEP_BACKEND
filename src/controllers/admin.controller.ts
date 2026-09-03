import User from "../models/user.model.js";
import { AdminAllBookingsQuery } from "../lib/schemaValidation.js";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { Request, Response, NextFunction } from "express";
import Hub from "../models/storageHub.model.js";
import Booking from "../models/booking.model.js";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";
import { generateBookingId } from "./booking.controller.js";

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

export const adminCreateBooking = tryCatchWrapper(
  async (req: Request, res: Response) => {
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
    } = req.body;

    const qty = Number(quantity);

    // 1. Verify Storage Hub existence
    const hub = await Hub.findById(hubId);
    if (!hub) {
      return sendTsRestError(res, 404, "Storage Hub not found");
    }

    // 2. Validate Available Capacity
    if (qty > hub.availableCapacity) {
      return sendTsRestError(
        res,
        400,
        `Requested quantity (${qty}) exceeds available hub capacity (${hub.availableCapacity})`,
      );
    }

    // 3. Validate Supported Crop
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

    // 4. Validate Unit Type Compatibility
    const hubUnitType = hub.unitType.toLowerCase();
    const requestedUnitType = (unitType || "bags").toLowerCase();

    if (hubUnitType !== "both" && hubUnitType !== requestedUnitType) {
      return sendTsRestError(
        res,
        400,
        `This storage facility only supports "${hub.unitType}" storage. You selected "${unitType}".`,
      );
    }

    // 5. Calculate Duration in Days
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

    // 6. Pricing Calculation
    const isCrate =
      requestedUnitType === "crates" || requestedUnitType === "crate";
    const baseDailyRate = isCrate
      ? hub.pricePerCratePerDay
      : hub.pricePerBagPerDay;

    if (!baseDailyRate || baseDailyRate <= 0) {
      return sendTsRestError(
        res,
        400,
        `This facility does not offer valid pricing for ${unitType} storage`,
      );
    }

    // Bulk discount threshold check (100+ units)
    const isBulk = qty >= 100;
    const dailyPricePerUnit = isBulk ? hub.priceBulk100Units : baseDailyRate;

    const storageFee = Math.round(dailyPricePerUnit * qty * totalDays);
    const serviceFee = 5000; // Standard service fee
    const totalAmount = storageFee + serviceFee;
    const depositAmount = Math.round(totalAmount * 0.3); // 30% standard deposit
    const balanceAmount = totalAmount - depositAmount;

    // 7. Create Custom Booking ID
    const bookingId = generateBookingId();

    const booking = await Booking.create({
      bookingId,
      hub: hub._id,
      user: userId || null,
      cropType: selectedCrop,
      quantity: qty,
      unitType: requestedUnitType,
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
      bookingStatus: bookingStatus || "confirmed",
    });

    return sendTsRestSuccess(res, 201, {
      success: true,
      message: "Admin booking created successfully",
      data: {
        booking,
      },
    });
  },
);
