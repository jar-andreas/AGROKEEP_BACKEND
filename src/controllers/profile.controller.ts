import { Request, Response } from "express";
import bcrypt from "bcrypt";
import User from "../models/user.model.js";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";



const formatLastChanged = (date?: Date): string => {
  if (!date) return "Password never changed";
  const now = new Date();
  const past = new Date(date);
  const diffInMs = now.getTime() - past.getTime();
  const days = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `Last changed ${years} ${years === 1 ? "year" : "years"} ago`;
  if (months > 0) return `Last changed ${months} ${months === 1 ? "month" : "months"} ago`;
  if (days > 0) return `Last changed ${days} ${days === 1 ? "day" : "days"} ago`;
  return "Last changed today";
};

/**
 * Save All Profile Settings in One Submission
 */
export const updateAllProfileSettings = tryCatchWrapper(async (req: Request, res: Response) => {
  const userId = req.session?.userId;
  const { fullName, email, phone, notificationPreferences, security } = req.body;

  // 1. Fetch user document
  const user = await User.findById(userId);
  if (!user) {
    return sendTsRestError(res, 404, "User not found");
  }

  // 2. Prevent updating demo-locked fields if passed
  if (email && email !== user.email) {
    return sendTsRestError(res, 400, "Email address cannot be changed in this demo");
  }
  if (phone && phone !== user.phone) {
    return sendTsRestError(res, 400, "Phone number cannot be changed in this demo");
  }

  // 3. Update Personal Info (Full Name)
  if (fullName && fullName.trim().length >= 5) {
    user.fullName = fullName.trim();
  }

  // 4. Update Notification Preferences traditionally
  if (notificationPreferences) {
    if (!user.notificationPreferences) {
      user.notificationPreferences = {
        bookingUpdates: true,
        paymentNotifications: true,
        reminderAlerts: true,
        smsNotifications: true,
        emailNotifications: false,
      };
    }

    const { bookingUpdates, paymentNotifications, reminderAlerts, smsNotifications, emailNotifications } = notificationPreferences;
    if (typeof bookingUpdates === "boolean") user.notificationPreferences.bookingUpdates = bookingUpdates;
    if (typeof paymentNotifications === "boolean") user.notificationPreferences.paymentNotifications = paymentNotifications;
    if (typeof reminderAlerts === "boolean") user.notificationPreferences.reminderAlerts = reminderAlerts;
    if (typeof smsNotifications === "boolean") user.notificationPreferences.smsNotifications = smsNotifications;
    if (typeof emailNotifications === "boolean") user.notificationPreferences.emailNotifications = emailNotifications;
  }

  // 5. Update Password (if security object provided)
  if (security?.currentPassword && security?.newPassword) {
    if (security.newPassword.length < 8) {
      return sendTsRestError(res, 400, "New password must be at least 8 characters long");
    }

    const isMatch = await bcrypt.compare(security.currentPassword, user.password);
    if (!isMatch) {
      return sendTsRestError(res, 400, "Incorrect current password");
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(security.newPassword, salt);
    user.passwordChangedAt = new Date();
  }

  // 6. Save all changes traditionally
  await user.save();

  return sendTsRestSuccess(res, 200, {
    message: "All profile settings saved successfully",
    data: {
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      notificationPreferences: user.notificationPreferences,
      passwordLastChanged: formatLastChanged(user.passwordChangedAt),
    },
  });
});

/**
 * Logout Controller
 */
export const logoutUser = tryCatchWrapper(async (req: Request, res: Response) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        return sendTsRestError(res, 500, "Could not log out, please try again");
      }
      res.clearCookie("connect.sid"); // Clear session cookie
      return sendTsRestSuccess(res, 200, {
        message: "Logged out successfully",
      });
    });
  } else {
    return sendTsRestSuccess(res, 200, {
      message: "Logged out successfully",
    });
  }
});

export function getProfileOverview(arg0: string, getProfileOverview: any) {
    throw new Error("Function not implemented.");
}
export function updatePersonalInfo(arg0: string, updatePersonalInfo: any) {
    throw new Error("Function not implemented.");
}

export function updateNotificationPreferences(arg0: string, updateNotificationPreferences: any) {
    throw new Error("Function not implemented.");
}

export function changePassword(arg0: string, changePassword: any) {
    throw new Error("Function not implemented.");
}

