import { Request, Response } from "express";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";
import User from "../models/user.model.js";
import Booking from "../models/booking.model.js";
import { sendAdminCustomMessageEmail } from "../lib/email.js";
import {
  AdminFarmersListQuery,
  FarmerIdParam,
  SendBookingEmailInput,
} from "../lib/schemaValidation.js";

const escapeRegex = (text: string) =>
  text.replace(/[-[\]{}()*+?^$|#\s]/g, "\\$&");

// Rough bags/crates -> metric tonnes conversion (standard 100kg bag). There's
// no per-crop weight data anywhere in the system yet, so this is a flat
// approximation applied to every unit regardless of crop or unitType —
// revisit if a more precise conversion becomes available.
const UNIT_TO_TONNES = 0.1;

type PopulatedHub = { _id: unknown; lga: string; state: string } | null;

interface BookingWithHub {
  totalAmount: number;
  quantity: number;
  hub: PopulatedHub;
}

const hubLocation = (hub: PopulatedHub): string | null =>
  hub ? `${hub.lga}, ${hub.state}` : null;

// "Farmers" are registered accounts (role: client) only — guest bookings
// (no linked user) don't have an account to attach totals/history to, so
// they're excluded here rather than synthesized into fake farmer rows.
export const getAdminFarmersList = tryCatchWrapper(
  async (req: Request<{}, {}, {}, AdminFarmersListQuery>, res: Response) => {
    const { search } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const users = await User.find({ role: "client" })
      .select("fullName email phone createdAt")
      .sort({ createdAt: -1 })
      .lean();

    // Enrich each farmer with their booking totals and most recent hub
    // location via simple per-user lookups — the farmer list is admin-scale
    // (tens of records), not public-scale, so this stays easy to follow
    // instead of one large aggregation pipeline.
    const farmers = await Promise.all(
      users.map(async (user) => {
        const bookings = (await Booking.find({ user: user._id })
          .select("totalAmount hub")
          .populate("hub", "lga state")
          .sort({ createdAt: -1 })
          .lean()) as unknown as BookingWithHub[];

        const totalSpent = bookings.reduce(
          (sum, booking) => sum + booking.totalAmount,
          0,
        );

        return {
          id: user._id,
          fullName: user.fullName,
          phoneNumber: user.phone,
          email: user.email,
          location: hubLocation(bookings[0]?.hub ?? null),
          totalBookings: bookings.length,
          totalSpent,
        };
      }),
    );

    // Location isn't a field on User, so matching it only becomes possible
    // after the lookups above — done here in one place alongside name/phone.
    const searchRegex = search ? new RegExp(escapeRegex(search), "i") : null;
    const matchingFarmers = searchRegex
      ? farmers.filter(
          (farmer) =>
            searchRegex.test(farmer.fullName) ||
            searchRegex.test(farmer.phoneNumber) ||
            (farmer.location ? searchRegex.test(farmer.location) : false),
        )
      : farmers;

    const total = matchingFarmers.length;
    const skip = (page - 1) * limit;
    const paginatedFarmers = matchingFarmers.slice(skip, skip + limit);

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: paginatedFarmers.length
        ? "Farmers retrieved successfully"
        : "No farmers matching criteria",
      data: {
        farmers: paginatedFarmers,
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

export const getAdminFarmerDetail = tryCatchWrapper(
  async (req: Request<FarmerIdParam>, res: Response) => {
    const { id } = req.params;

    const user = await User.findOne({ _id: id, role: "client" })
      .select("fullName email phone createdAt")
      .lean();
    if (!user) {
      return sendTsRestError(res, 404, "Farmer not found");
    }

    const bookings = (await Booking.find({ user: user._id })
      .select("quantity hub")
      .populate("hub", "lga state")
      .sort({ createdAt: -1 })
      .lean()) as unknown as BookingWithHub[];

    const totalQuantity = bookings.reduce(
      (sum, booking) => sum + booking.quantity,
      0,
    );
    const uniqueHubIds = new Set(
      bookings
        .filter((booking) => booking.hub)
        .map((booking) => String(booking.hub!._id)),
    );

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: "Farmer details retrieved successfully",
      data: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phone,
        location: hubLocation(bookings[0]?.hub ?? null),
        memberSince: user.createdAt,
        totalBookings: bookings.length,
        hubsUsed: uniqueHubIds.size,
        tonnesStored: parseFloat((totalQuantity * UNIT_TO_TONNES).toFixed(2)),
      },
    });
  },
);

// Mirrors sendBookingEmailAdmin / sendHubContactEmail exactly — admin picks a
// quick template (frontend-only, prefills subject/message) or types a fully
// custom message, sent to this one farmer directly.
export const sendFarmerEmail = tryCatchWrapper(
  async (
    req: Request<FarmerIdParam, {}, SendBookingEmailInput>,
    res: Response,
  ) => {
    const { id } = req.params;
    const { subject, message } = req.body;

    const user = await User.findOne({ _id: id, role: "client" })
      .select("fullName email")
      .lean();
    if (!user) {
      return sendTsRestError(res, 404, "Farmer not found");
    }

    const sent = await sendAdminCustomMessageEmail(
      user.email,
      user.fullName,
      `Farmer Account: ${user.fullName}`,
      subject,
      message,
    );

    if (!sent) {
      return sendTsRestError(
        res,
        502,
        "Failed to send the email. Please try again shortly.",
      );
    }

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: "Email sent successfully",
    });
  },
);
