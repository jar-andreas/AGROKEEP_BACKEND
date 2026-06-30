import mongoose, { Schema, Document } from "mongoose";

export interface IOtp extends Document {
  email: string;
  otp: string; //hashed otp
  expiresAt: Date;
  attempts: number;
}
const OtpSchema = new Schema<IOtp>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    otp: { type: String, required: true },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, //mongodb will automatically delete the document after expiresAt time
    },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

//only one active otp per email at a time
OtpSchema.index({ email: 1 }, { unique: true });

const Otp =
  mongoose.models.Otp || mongoose.model<IOtp>("Otp", OtpSchema, "otps");

export default Otp;
