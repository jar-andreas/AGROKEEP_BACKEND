import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";
import Review from "../models/farmersReview.model.js";
import Hub from "../models/storageHub.model.js";
import { Request, Response } from "express";

export const createHubReview = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const { hubId } = req.params;
    const {
      comment,
      cleanlinessRating,
      securityRating,
      accuracyRating,
      communicationRating,
      valueRating,
    } = req.body;

    const userId =
      (req.session as any)?.user?._id || (req.session as any)?.userId;

    // 1. Verify the hub exists
    const hub = await Hub.findById(hubId);
    if (!hub) {
      return sendTsRestError(res, 404, "Storage Hub not found");
    }

    // 2. Prevent duplicate reviews by the same user (Optional)
    const existingReview = await Review.findOne({ hub: hubId, user: userId });
    if (existingReview) {
      return sendTsRestError(res, 400, "You have already reviewed this hub");
    }

    // 3. Save the new review
    const review = await Review.create({
      hub: hubId,
      user: userId,
      comment,
      cleanlinessRating,
      securityRating,
      accuracyRating,
      communicationRating,
      valueRating,
    });

    // 4. Recalculate and update the Hub's rating summary

    return sendTsRestSuccess(res, 201, {
      message: "Review submitted successfully",
      data: review,
    });
  },
);
