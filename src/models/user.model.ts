import mongoose, { Schema, Document } from "mongoose";

// 1. Interface for Notification Preferences
export interface INotificationPreferences {
  bookingUpdates: boolean;
  paymentNotifications: boolean;
  reminderAlerts: boolean;
  smsNotifications: boolean;
  emailNotifications: boolean;
}

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  fullName: string;
  email: string;
  phone: string;
  password: string;
  avatarUrl?: string;
  avatarPublicId?: string;
  passwordChangedAt?: Date;
  emailVerified: boolean;
  role: "admin" | "client";
  createdAt: Date;
  updatedAt: Date;
  notificationPreferences: INotificationPreferences;
}

// 3. Sub-Schema for Notification Preferences
const NotificationPreferencesSchema = new Schema<INotificationPreferences>(
  {
    bookingUpdates: { type: Boolean, default: true },
    paymentNotifications: { type: Boolean, default: true },
    reminderAlerts: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: false },
  },
  { _id: false }, // Prevents generating an unnecessary subdocument _id
);

const UserSchema = new Schema<IUser>(
  {
    fullName: {
      type: String,
      required: [true, "Fullname is required"],
      trim: true,
      minlength: [5, "Fullname must be at least 5 characters"],
      maxlength: [50, "Fullname must be at most 50 characters"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please fill a valid email address",
      ],
    },

    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      match: [/^\+?[1-9]\d{1,14}$/, "Please fill a valid phone number"],
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
    },

    passwordChangedAt: {
      type: Date,
    },

    avatarUrl: {
      type: String,
      default: "",
    },

    avatarPublicId: {
      type: String,
      default: "",
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    role: {
      type: String,
      enum: {
        values: ["client", "admin"],
        message: "Role must be either client or admin",
      },
      default: "client",
    },

    notificationPreferences: {
      type: NotificationPreferencesSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

UserSchema.index({ fullName: 1 });
UserSchema.index({ role: 1 });

const User =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema, "user");

export default User;
