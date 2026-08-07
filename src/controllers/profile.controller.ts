import { Request, Response } from "express";
import bcrypt from "bcrypt";
import User from "../models/user.model.js";
import Booking from "../models/booking.model.js";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";
import mongoose from "mongoose";
import {
  deleteFromCloudinary,
  uploadAvatarToCloudinary,
} from "../services/cloudinary.service.js";

const formatLastChanged = (date?: Date): string => {
  if (!date) return "Password never changed";
  const now = new Date();
  const past = new Date(date);
  const diffInMs = now.getTime() - past.getTime();
  const days = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0)
    return `Last changed ${years} ${years === 1 ? "year" : "years"} ago`;
  if (months > 0)
    return `Last changed ${months} ${months === 1 ? "month" : "months"} ago`;
  if (days > 0)
    return `Last changed ${days} ${days === 1 ? "day" : "days"} ago`;
  return "Last changed today";
};

export const getUserProfile = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const userId = req.session.userId || (res as any).session?.userId;

    // 1. Guard against undefined userId
    if (!userId) {
      return sendTsRestError(res, 401, "User authentication required");
    }

    // Convert string userId to mongoose ObjectId for aggregation
    const userObjectId = new mongoose.Types.ObjectId(userId.toString());

    const user = await User.findById(userId).select("-password").lean();

    if (!user) {
      return sendTsRestError(res, 404, "User not found");
    }

    //Run  booking metrics in parallel
    const [totalBookings, distinctHubs, storageStats] = await Promise.all([
      Booking.countDocuments({ user: userId }),
      Booking.distinct("hub", { user: userId }),
      Booking.aggregate([
        { $match: { user: userObjectId, bookingStatus: "confirmed" } },
        { $group: { _id: null, totalQuantity: { $sum: "$quantity" } } },
      ]),
    ]);

    const totalStoredQuantity = storageStats[0]?.totalQuantity || 0;
    return sendTsRestSuccess(res, 200, {
      status: "success",
      message: "User profile retrieved successfully",
      data: {
        user: {
          ...user,
          passwordLastChanged: formatLastChanged(user.passwordChangedAt),
        },
        stats: {
          totalBookings,
          hubsUsed: distinctHubs.length,
          totalStoredQuantity,
        },
      },
    });
  },
);

export const updateUserProfile = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const userId = req.session?.userId || (req as any).session?.userId;

    if (!userId) {
      return sendTsRestError(res, 401, "User authentication required");
    }

    const { fullName, phone, notificationPreferences } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return sendTsRestError(res, 404, "User not found");
    }

    // 1. Update personal details if provided
    if (fullName !== undefined) user.fullName = fullName;
    if (phone !== undefined) user.phone = phone;

    // 2. Update notification preferences cleanly via merging
    if (
      notificationPreferences &&
      typeof notificationPreferences === "object"
    ) {
      user.notificationPreferences = {
        ...user.notificationPreferences,
        ...notificationPreferences,
      };
    }

    await user.save();

    // 3. Exclude password from the returned document
    const userResponse = user.toObject();
    delete userResponse.password;

    return sendTsRestSuccess(res, 200, {
      status: "success",
      message: "Profile updated successfully",
      data: userResponse,
    });
  },
);

export const changePassword = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const userId = req.session?.userId || (req as any).session?.userId;

    if (!userId) {
      return sendTsRestError(res, 401, "User authentication required");
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate presence of all fields
    if (!currentPassword || !newPassword || !confirmPassword) {
      return sendTsRestError(
        res,
        400,
        "current passowrd, new password and confirm password are required",
      );
    }

    // Validate password match
    if (newPassword !== confirmPassword) {
      return sendTsRestError(
        res,
        400,
        "New password and confirm password do not match",
      );
    }

    // Ensure new password is not the same as current password
    if (currentPassword === newPassword) {
      return sendTsRestError(
        res,
        400,
        "New password must be different from your current password",
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendTsRestError(res, 404, "User not found");
    }

    //verify current password against stored hash
    const passwordIsMatch = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!passwordIsMatch) {
      return sendTsRestError(res, 400, "Incorrect current password");
    }
    //salt and hash the new passsword
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.passwordChangedAt = new Date();
    await user.save();

    return sendTsRestSuccess(res, 200, {
      status: "success",
      message: "Password updated successfully",
    });
  },
);

export const uploadAvatar = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const userId = req.session?.userId || (req as any).session?.userId;

    if (!userId) {
      return sendTsRestError(res, 401, "User authentication required");
    }

    if (!req.file) {
      return sendTsRestError(res, 400, "Please select an image file to upload");
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendTsRestError(res, 404, "User not found");
    }

    // 1. Remove previous avatar from Cloudinary if present
    if (user.avatarPublicId) {
      await deleteFromCloudinary(user.avatarPublicId);
    }

    // 2. Upload new image buffer directly from RAM
    const { url, publicId } = await uploadAvatarToCloudinary(req.file.buffer);

    // 3. Persist new image credentials to DB
    user.avatarUrl = url;
    user.avatarPublicId = publicId;
    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    return sendTsRestSuccess(res, 200, {
      status: "success",
      message: "Avatar uploaded successfully",
      data: userResponse,
    });
  },
);

export const deleteAvatar = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const userId = req.session?.userId || (req as any).session?.userId;

    if (!userId) {
      return sendTsRestError(res, 401, "User authentication required");
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendTsRestError(res, 404, "User not found");
    }

    if (!user.avatarPublicId && !user.avatarUrl) {
      return sendTsRestError(res, 400, "User does not have an active avatar");
    }
    // 1. Destroy asset on Cloudinary
    if (user.avatarPublicId) {
      await deleteFromCloudinary(user.avatarPublicId);
    }

    // 2. Clear fields in database
    user.avatarUrl = undefined;
    user.avatarPublicId = undefined;
    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;

    return sendTsRestSuccess(res, 200, {
      status: "success",
      message: "Avatar removed successfully",
      data: userResponse,
    });
  },
);
