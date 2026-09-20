import { Router } from "express";
import {
  adminCreateBooking,
  cancelBookingAdmin,
  completeRefundAdmin,
  getAdminHubLocations,
  getAdminHubs,
  getAllBookingsAdmin,
  getBookingFilterOptions,
  getRefundsQueueAdmin,
  getSingleBookingAdmin,
  sendBookingEmailAdmin,
} from "../controllers/admin.controller.js";
import {
  adminAllBookingsQuerySchema,
  adminHubsQuerySchema,
  AdminCreateBookingSchema,
  getSingleBookingAdminParamSchema,
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
  "/all-bookings",
  isAuthenticated,
  isAdmin,
  validateQueryParams(adminAllBookingsQuerySchema),
  getAllBookingsAdmin,
);

router.get(
  "/booking-filter-options",
  isAuthenticated,
  isAdmin,
  getBookingFilterOptions,
);

router.get(
  "/hub-locations",
  isAuthenticated,
  isAdmin,
  getAdminHubLocations,
);

router.get(
  "/hubs",
  isAuthenticated,
  isAdmin,
  validateQueryParams(adminHubsQuerySchema),
  getAdminHubs,
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

router.post(
  "/booking/:id/email",
  isAuthenticated,
  isAdmin,
  customRateLimiter(20, 10), // 20 sends per 10 minutes
  validateParams(getSingleBookingAdminParamSchema),
  validateFormData(sendBookingEmailSchema),
  sendBookingEmailAdmin,
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
