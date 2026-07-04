import mongoose, { Schema, Document } from "mongoose";

export interface IContactInquiry extends Document {
  fullName: string;
  email: string;
  phone: string;
  message: string;
}

const ContactInquirySchema = new Schema<IContactInquiry>(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email address is required"],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
    },
    message: {
      type: String,
      required: [true, "Message body cannot be empty"],
      maxlength: [2000, "Message is too long"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

ContactInquirySchema.index({ email: 1 });
ContactInquirySchema.index({ fullName: 1 });

const ContactInquiry =
  mongoose.models.ContactInquiry ||
  mongoose.model<IContactInquiry>("ContactInquiry", ContactInquirySchema);

export default ContactInquiry;
