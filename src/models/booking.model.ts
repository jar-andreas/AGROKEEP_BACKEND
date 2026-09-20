import mongoose, { Schema, Document } from "mongoose";

// Single source of truth for these two enums — reused by the schema below
// and by the admin filter-options endpoint, so the filter dropdowns can
// never drift out of sync with what's actually valid on a Booking.
export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "in_storage",
  "completed",
  "cancelled",
] as const;

export const PAYMENT_STATUSES = [
  "unpaid",
  "partial_deposit_paid",
  "fully_paid",
  "refund_required",
  "refunded",
] as const;

export interface IBooking extends Document {
  bookingId: string; //e.g. "AK-JFCX7K"
  hub: Schema.Types.ObjectId;
  user?: Schema.Types.ObjectId;
  // The admin who created this booking on the customer's behalf via the
  // admin dashboard. Unset for bookings the customer made themselves through
  // the public flow.
  createdBy?: Schema.Types.ObjectId;
  cropType: string;
  quantity: number;
  unitType: string;
  dropOffDate: Date;
  pickUpDate: Date;
  durationInDays: number;

  //contact details
  fullName: string;
  phoneNumber: string;
  email?: string;
  specialInstructions?: string;

  // Financial Breakdown
  dailyPricePerUnit: number;
  storageFee: number;
  serviceFee: number;
  totalAmount: number;
  depositAmount: number; // 30%
  balanceAmount: number; // 70%

  // Statuses
  bookingStatus: (typeof BOOKING_STATUSES)[number];
  paymentStatus: (typeof PAYMENT_STATUSES)[number];
  paymentReference?: string;
}

const BookingSchema = new Schema<IBooking>(
  {
    bookingId: { type: String, required: true, unique: true },
    hub: { type: Schema.Types.ObjectId, ref: "Hub", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    cropType: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitType: { type: String, default: "bags" },
    dropOffDate: { type: Date, required: true },
    pickUpDate: { type: Date, required: true },
    durationInDays: { type: Number, required: true },
    fullName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    email: { type: String },
    specialInstructions: { type: String },

    dailyPricePerUnit: { type: Number, required: true },
    storageFee: { type: Number, required: true },
    serviceFee: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    depositAmount: { type: Number, required: true },
    balanceAmount: { type: Number, required: true },

    bookingStatus: {
      type: String,
      enum: BOOKING_STATUSES,
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "unpaid",
    },
    paymentReference: { type: String },
  },
  { timestamps: true },
);

BookingSchema.index({ user: 1, createdAt: -1 });
BookingSchema.index({ hub: 1, bookingStatus: 1 });

const Booking =
  mongoose.models.Booking ||
  mongoose.model<IBooking>("Booking", BookingSchema, "bookings");

export default Booking;
