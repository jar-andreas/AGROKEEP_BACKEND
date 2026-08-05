import { Router } from "express";
import { validateFormData } from "../middleware/formvalidate.middleware.js";
import { isAuthenticated } from "../middleware/auth.middleware.js";
import { createBookingSchema } from "../lib/schemaValidation.js";
import {
  createBooking,
  getMyBookings,
  getSingleBooking,
} from "../controllers/booking.controller.js";
import { customRateLimiter } from "../middleware/ratelimit.middleware.js";

const router = Router();

router.post(
  "/create",
  customRateLimiter(5, 10),
  isAuthenticated,
  validateFormData(createBookingSchema),
  createBooking,
);

router.get("/my-bookings", isAuthenticated, getMyBookings);

router.get("/single-booking/:id", isAuthenticated, getSingleBooking);

export default router;
