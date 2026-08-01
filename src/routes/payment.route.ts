import {
  initializePaymentSchema,
  verifyPaymentSchema,
} from "../lib/schemaValidation.js";
import { Router } from "express";
import {
  initializePayment,
  verifyPayment,
} from "../controllers/payment.controller.js";
import {
  validateFormData,
  validateQueryParams,
} from "../middleware/formvalidate.middleware.js";
import { isAuthenticated } from "../middleware/auth.middleware.js";

const router = Router();

router.post(
  "/initialize",
  isAuthenticated,
  validateFormData(initializePaymentSchema),
  initializePayment,
);

router.get(
  "/verify",
  isAuthenticated,
  validateQueryParams(verifyPaymentSchema),
  verifyPayment,
);

export default router;
