import mongoose, { Schema, Document } from "mongoose";

export interface IPayment extends Document {
  user?: mongoose.Types.ObjectId;
  booking: mongoose.Types.ObjectId;
  hub: mongoose.Types.ObjectId;
  reference: string;
  paymentMethod: "paystack" | "bank_transfer" | "cash";
  paymentType: "deposit" | "balance" | "full";
  amount: number;
  currency: string;
  status: "pending" | "success" | "failed" | "abandoned" | "refunded";
  paidAt: Date;
  paystackDetails?: Record<string, any>; // Full metadata audit trail from Paystack
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false, //optional to support guest checkouts
    },
    booking: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: [true, "Payment must be tied to a booking"],
    },
    hub: {
      type: Schema.Types.ObjectId,
      ref: "Hub",
      required: [true, "Payment must be tied to a storage hub"],
    },
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["paystack", "bank_transfer", "cash"],
      default: "paystack",
    },
    paymentType: {
      type: String,
      enum: ["deposit", "balance", "full"],
      default: "deposit",
    },
    amount: {
      type: Number,
      required: [true, "Payment amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    currency: {
      type: String,
      default: "NGN",
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "abandoned", "refunded"],
      default: "pending",
      index: true,
    },
    paidAt: {
      type: Date,
    },
    paystackDetails: {
      type: Schema.Types.Mixed, // Stores full Paystack verification payload for auditing
    },
  },
  { timestamps: true },
);

//indexing for faster reporting and search queries
paymentSchema.index({ booking: 1, status: 1 });

const Payment =
  mongoose.models.Payment ||
  mongoose.model<IPayment>("Payment", paymentSchema, "payments");

export default Payment;
