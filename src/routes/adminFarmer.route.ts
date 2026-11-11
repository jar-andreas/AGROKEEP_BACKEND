import { Router } from "express";
import {
  getAdminFarmerDetail,
  getAdminFarmersList,
  sendFarmerEmail,
} from "../controllers/adminFarmer.controller.js";
import {
  adminFarmersListQuerySchema,
  farmerIdParamSchema,
  sendBookingEmailSchema,
} from "../lib/schemaValidation.js";
import { isAdmin, isAuthenticated } from "../middleware/auth.middleware.js";
import { customRateLimiter } from "../middleware/ratelimit.middleware.js";
import {
  validateFormData,
  validateParams,
  validateQueryParams,
} from "../middleware/formvalidate.middleware.js";

const router = Router();

router.get(
  "/",
  isAuthenticated,
  isAdmin,
  validateQueryParams(adminFarmersListQuerySchema),
  getAdminFarmersList,
);

router.get(
  "/:id",
  isAuthenticated,
  isAdmin,
  validateParams(farmerIdParamSchema),
  getAdminFarmerDetail,
);

router.post(
  "/:id/email",
  isAuthenticated,
  isAdmin,
  customRateLimiter(20, 10),
  validateParams(farmerIdParamSchema),
  validateFormData(sendBookingEmailSchema),
  sendFarmerEmail,
);

export default router;
