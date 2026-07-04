import { Router } from "express";
import { handleContactInquiry } from "../controllers/contactUs.controller.js";
import { customRateLimiter } from "../middleware/ratelimit.middleware.js";
import { validateFormData } from "../middleware/formvalidate.middleware.js";
import { validateContactUsSchema } from "../lib/schemaValidation.js";

const router = Router();

router.post(
  "/",
  customRateLimiter(5, 10), //5 requests per 10 min
  validateFormData(validateContactUsSchema),
  handleContactInquiry,
);

export default router;
