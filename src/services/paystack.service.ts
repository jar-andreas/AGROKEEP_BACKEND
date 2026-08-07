import mongoose from "mongoose";
import crypto from "crypto";
import { env } from "../config/keys.js";
import logger from "../config/logger.js";
import { getPaystack } from "../config/paystack.config.js";
import Booking from "../models/booking.model.js";
import {
  InitializePaymentData,
  PaystackCreateResponse,
  VerifyPaymentData,
  PaystackVerifyResponse,
} from "../interfaces/payment.interface.js";
import { sendPaymentSuccessEmail } from "../lib/email.js";

export class PaystackService {
  //initialize payment (30% deposit)

  async InitializePayment(
    data: InitializePaymentData,
  ): Promise<PaystackCreateResponse> {
    try {
      //find booking bt custom bookingId or MongoDb _id
      const isMongoId = mongoose.Types.ObjectId.isValid(data.bookingId);
      const booking = await Booking.findOne(
        isMongoId
          ? { $or: [{ bookingId: data.bookingId }, { _id: data.bookingId }] }
          : { bookingId: data.bookingId },
      );

      if (!booking) {
        throw new Error("Booking record not found");
      }

      if (booking.paymentStatus !== "unpaid") {
        throw new Error(
          `Payment already initialized or processed for this booking (Status: ${booking.paymentStatus})`,
        );
      }

      //convert deposit amount to Kobo (Paystack requirement)
      const amountInKobo = Math.round(booking.depositAmount * 100);

      //generate unique reference paystack code
      const reference = `RF-${crypto.randomBytes(4).toString("hex").toUpperCase()}-${Date.now().toString().slice(-4)}`;

      //use customer email or fallback for guest checkout

      const customerEmail = booking.email || "guest@storageapp.com";

      //construct frontend callback url
      const redirectSlug = data.slug ? `&slug=${data.slug}` : "";
      const callbackUrl = `${env.CLIENT_URL}/verify-payment?reference=${reference}${redirectSlug}`;

      //call paystack api
      const response = await getPaystack().post("/transaction/initialize", {
        email: customerEmail,
        amount: amountInKobo,
        reference,
        metadata: {
          bookingId: booking._id.toString(),
          customBookingId: booking.bookingId,
          hubId: booking.hub.toString(),
          userId: booking.user ? booking.user.toString() : null,
        },
        callback_url: callbackUrl,
      });
      return response.data;
    } catch (error: any) {
      logger.error(
        "Paystack Initialization Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message ||
          error.message ||
          "Failed to initialize payment",
      );
    }
  }

  //verify payment: verifies reference with paystack, updates payment and booking status and atomically locks/deducts hub storage capacity

  async VerifyPayment(data: VerifyPaymentData): Promise<any> {
    try {
      logger.info(
        `Verifying Paystack transaction for reference: ${data.reference}`,
      );
      //call paystack verify api to verify reference
      const response = await getPaystack().get(
        `/transaction/verify/${data.reference}`,
      );

      const tx = response.data.data;

      //check transaction status from paystack
      if (!response.data.status || tx.status !== "success") {
        throw new Error(
          `Payment verification failed. Paystack status: ${tx.status || "failed"}`,
        );
      }

      //extract metadata attached during initialization
      const metadata = tx.metadata;
      const bookingId = metadata.bookingId;

      //Dynamic imports to prevent potential circular dependency issues
      const Booking = (await import("../models/booking.model.js")).default;
      const Hub = (await import("../models/storageHub.model.js")).default;
      const Payment = (await import("../models/payment.model.js")).default;

      //retrieve booking
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error("Associated booking not found");
      }

      //Idempotency check: If booking is already confirmed, return early
      if (
        booking.bookingStatus === "confirmed" &&
        (booking.paymentStatus === "partial_deposit_paid" ||
          booking.paymentStatus === "fully_paid")
      ) {
        logger.info(
          `Booking ${booking.bookingId} is already verified and confirmed`,
        );
        const existingPayment = await Payment.findOne({
          reference: tx.reference,
        });

        // 🟢 POPULATE HUB FOR REFRESH / IDEMPOTENT CASES
        await booking.populate("hub", "address name state lga slug images");
        return { booking, payment: existingPayment, hub: booking.hub };
      }

      //atomic capacity deduction (Race condition protection)
      const updatedHub = await Hub.findOneAndUpdate(
        {
          _id: booking.hub,
          availableCapacity: { $gte: booking.quantity }, //ensure sufficient space remaining
        },
        {
          $inc: { availableCapacity: -booking.quantity }, //atomically deduct booked capacity
        },
        {
          new: true,
        },
      );

      // Edge case: Capacity ran out while customer was filling card details
      if (!updatedHub) {
        logger.error(
          `Overbooking detected! Space ran out for Booking: ${booking.bookingId}`,
        );
        booking.bookingStatus = "cancelled";
        booking.paymentStatus = "refund_required";
        await booking.save();

        throw new Error(
          "Storage capacity filled up prior to payment confirmation. Your payment will be processed for a refund.",
        );
      }

      //create / upsert payment record
      const amountPaidInNaira = tx.amount / 100; // convert kobo to naira
      const paymentType = metadata.paymentType || "deposit";

      const paymentUpdate = {
        user: metadata.userId,
        booking: booking._id,
        hub: booking.hub,
        paymentMethod: "paystack",
        amount: amountPaidInNaira,
        status: "success" as const,
        paymentType,
        reference: tx.reference,
        paidAt: new Date(tx.paid_at || Date.now()),
        paystackDetails: tx,
      };

      const paymentRecord = await Payment.findOneAndUpdate(
        {
          reference: tx.reference,
        },
        paymentUpdate,
        { upsert: true, new: true },
      );

      //update booking status
      booking.bookingStatus = "confirmed";
      booking.paymentStatus =
        paymentType === "balance" ? "fully_paid" : "partial_deposit_paid";
      booking.payment = paymentRecord._id;
      await booking.save();

      logger.info(
        `Booking ${booking.bookingId} verified successfully. Quantity ${booking.quantity} reserved on Hub`,
      );

      // 1. Call helper safely with optional chaining and fallback
      if (paymentRecord) {
        const userId = paymentRecord.user
          ? paymentRecord.user.toString()
          : null;
        const customerEmail = booking.email || tx.customer?.email;

        await this._triggerPaymentConfirmation(
          userId,
          customerEmail,
          amountPaidInNaira,
          tx.reference,
        );
      }

      return {
        booking,
        payment: paymentRecord,
      };
    } catch (error: any) {
      logger.error("Paystack Verification Error:", error.message);
      throw new Error(error.message || "Payment verification failed");
    }
  }

  /**
   * Private Side-Effect Handler: Finds user or falls back to booking email to send Brevo notification
   */
  private async _triggerPaymentConfirmation(
    userId: string | null,
    guestEmail: string | undefined,
    amount: number,
    ref: string,
  ): Promise<void> {
    try {
      let recipientEmail = guestEmail;
      let recipientName = "Agrokeep Customer";

      // If user exists, fetch user profile details
      if (userId) {
        const User = (await import("../models/user.model.js")).default;
        const user = await User.findById(userId);

        if (user) {
          recipientEmail = user.email;
          recipientName = `${user.fullName}`.trim() || recipientName;
        }
      }

      if (!recipientEmail) {
        logger.warn(
          `Email skip: No valid email address found for reference ${ref}`,
        );
        return;
      }

      await sendPaymentSuccessEmail(recipientEmail, recipientName, amount, ref);

      logger.info(
        `Payment confirmation email sent via Brevo to ${recipientEmail}`,
      );
    } catch (error: any) {
      logger.error("Side-effect failed (Email not sent):", error.message);
    }
  }
}
