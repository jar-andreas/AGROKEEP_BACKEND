import { Request, Response } from "express";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";
import { PaystackService } from "../services/paystack.service.js";

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
