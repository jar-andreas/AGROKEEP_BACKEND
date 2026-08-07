import { Request, Response } from "express";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";
import { PaystackService } from "../services/paystack.service.js";
import Payment from "../models/payment.model.js";
import PDFDocument from "pdfkit";

const payStackService = new PaystackService();

export const initializePayment = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const { bookingId, hubId, slug } = req.body;

    if (!bookingId || !hubId || !slug) {
      sendTsRestError(
        res,
        400,
        "Either the slug, hubId or the bookingId is missing",
      );
    }

    const result = await payStackService.InitializePayment({
      bookingId,
      hubId,
      slug,
    });
    return sendTsRestSuccess(res, 200, {
      message: "Payment initialized successfully",
      data: {
        authorizationUrl: result.data.authorization_url,
        accessCode: result.data.access_code,
        reference: result.data.reference,
      },
    });
  },
);

export const verifyPayment = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const { reference } = req.query;

    if (!reference) {
      return sendTsRestError(res, 400, "Transaction reference is required");
    }

    const result = await payStackService.VerifyPayment({
      reference: reference as string,
    });

    return sendTsRestSuccess(res, 200, {
      message: "Payment verified and booking confirmed successfully",
      data: result,
    });
  },
);

export const generateReceiptPDF = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const { reference } = req.params;

    // 1. Fetch payment details
    const payment = await Payment.findOne({ reference })
      .populate("booking")
      .populate("hub");

    if (!payment) {
      return sendTsRestError(res, 404, "Receipt record not found");
    }

    const booking = payment.booking as any;
    const hub = payment.hub as any;

    // 2. Initialize PDF Stream
    const doc = new PDFDocument({ size: "A4", margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Agrokeep-Receipt-${reference}.pdf`,
    );

    // Pipe PDF output directly to Express response
    doc.pipe(res);

    // 3. Header & Branding
    doc
      .fillColor("#1E5631")
      .fontSize(22)
      .text("AGROKEEP STORAGE HUB", { align: "left" });
    doc
      .fontSize(10)
      .fillColor("#555555")
      .text("Official Payment & Storage Reservation Receipt");
    doc.moveDown(1.5);

    // Divider Line
    doc
      .strokeColor("#1E5631")
      .lineWidth(1)
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();
    doc.moveDown(1.5);

    // 4. Metadata Details
    doc.fontSize(10).fillColor("#000000");
    doc.text(`Receipt Reference: ${payment.reference}`);
    doc.text(`Payment Date: ${new Date(payment.paidAt).toLocaleDateString()}`);
    doc.text(`Booking ID: ${booking?.bookingId || "N/A"}`);
    doc.text(`Payment Status: ${payment.status.toUpperCase()}`);
    doc.moveDown(1.5);

    // 5. Storage Summary Box
    const boxStartY = doc.y;
    const boxHeight = 110;

    doc.rect(50, boxStartY, 495, boxHeight).fillAndStroke("#034a28", "#034a28");

    doc
      .fillColor("#fdfffd")
      .fontSize(12)
      .text("Storage Details", 65, boxStartY + 15);

    doc
      .fillColor("#1e9e07")
      .fontSize(10)
      .text(`Storage Hub: ${hub?.name || "N/A"}`, 65, boxStartY + 35)
      .text(
        `Location: ${hub?.address || ""}, ${hub?.state || ""}`,
        65,
        boxStartY + 50,
      )
      .text(
        `Crop Reserved: ${booking?.cropType || "General Produce"}`,
        65,
        boxStartY + 65,
      )
      .text(
        `Quantity Booked: ${booking?.quantity || 0} Units`,
        65,
        boxStartY + 80,
      );

    // 🟢 Fix: Reset Y position below the absolute box so Section 6 doesn't overlap
    doc.y = boxStartY + boxHeight + 25;
    doc.x = 50; // Reset X margin

    // 6. Financial Summary
    doc.fillColor("#1E5631").fontSize(12).text("Payment Summary");
    doc.moveDown(0.5);

    doc.fontSize(10).fillColor("#000000");
    doc.text(
      `Payment Type: ${payment.paymentType === "deposit" ? "Partial Deposit" : "Balance Settlement"}`,
    );
    doc.text(`Payment Method: Paystack (${payment.paymentMethod})`);
    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .fillColor("#1E5631")
      .text(`Total Amount Paid: NGN ${payment.amount.toLocaleString()}`);

    doc.moveDown(3);

    // 7. Footer
    doc
      .fontSize(9)
      .fillColor("#565353")
      .text(
        "Thank you for storing with Agrokeep. For inquiries, contact support@agrokeep.com.",
        { align: "center" },
      );
    doc.end();
  },
);
