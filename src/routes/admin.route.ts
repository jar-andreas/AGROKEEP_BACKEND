import { Router } from "express";
import {
  adminCreateBooking,
  cancelBookingAdmin,
  completeRefundAdmin,
  getAllBookingsAdmin,
  getRefundsQueueAdmin,
  getSingleBookingAdmin,
} from "../controllers/admin.controller.js";
import {
  adminAllBookingsQuerySchema,
  AdminCreateBookingSchema,
  getSingleBookingAdminParamSchema,
} from "../lib/schemaValidation.js";
import { isAdmin, isAuthenticated } from "../middleware/auth.middleware.js";
import {
  validateFormData,
  validateParams,
  validateQueryParams,
} from "../middleware/formvalidate.middleware.js";

const router = Router();

router.get(
  "/all-bookings",
  isAuthenticated,
  isAdmin,
  validateQueryParams(adminAllBookingsQuerySchema),
  getAllBookingsAdmin,
);

router.post(
  "/create-booking",
  isAuthenticated,
  isAdmin,
  validateFormData(AdminCreateBookingSchema),
  adminCreateBooking,
);

router.get(
  "/booking/:id",
  isAuthenticated,
  isAdmin,
  validateParams(getSingleBookingAdminParamSchema),
  getSingleBookingAdmin,
);

router.patch(
  "/booking/:id/cancel",
  isAuthenticated,
  isAdmin,
  validateParams(getSingleBookingAdminParamSchema),
  cancelBookingAdmin,
);

router.get("/refunds", isAuthenticated, isAdmin, getRefundsQueueAdmin);

router.patch(
  "/refunds/:id/complete",
  isAuthenticated,
  isAdmin,
  validateParams(getSingleBookingAdminParamSchema),
  completeRefundAdmin,
);

export default router;
