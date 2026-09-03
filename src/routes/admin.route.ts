import { Router } from "express";
import {
  adminCreateBooking,
  getAllBookingsAdmin,
} from "../controllers/admin.controller.js";
import {
  adminAllBookingsQuerySchema,
  AdminCreateBookingSchema,
} from "../lib/schemaValidation.js";
import { isAdmin, isAuthenticated } from "../middleware/auth.middleware.js";
import {
  validateFormData,
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

export default router;
