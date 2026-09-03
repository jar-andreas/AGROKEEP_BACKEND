import { Router } from "express";
import {
  createBooking,
  getMyBookings,
  getSingleBooking,
  getAllBookingsAdmin,
  adminCreateBooking,
} from "../controllers/booking.controller.js";
import { isAuthenticated, isAdmin } from "../middleware/auth.middleware.js";
import {
  validateFormData,
  validateQueryParams,
} from "../middleware/formvalidate.middleware.js";
import { customRateLimiter } from "../middleware/ratelimit.middleware.js";
import {
  createBookingSchema,
  adminAllBookingsQuerySchema,
  AdminCreateBookingSchema,
} from "../lib/schemaValidation.js";

const router = Router();

// User Routes
router.post(
  "/create",
  customRateLimiter(5, 10),
  isAuthenticated,
  validateFormData(createBookingSchema),
  createBooking,
);

router.get("/my-bookings", isAuthenticated, getMyBookings);

router.get("/single-booking/:id", isAuthenticated, getSingleBooking);

// Admin Routes
router.get(
  "/admin/all",
  isAuthenticated,
  isAdmin,
  validateQueryParams(adminAllBookingsQuerySchema),
  getAllBookingsAdmin,
);

router.post(
  "/admin/create",
  isAuthenticated,
  isAdmin,
  validateFormData(AdminCreateBookingSchema),
  adminCreateBooking,
);

export default router;