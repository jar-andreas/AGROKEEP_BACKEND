import { Router } from "express";
import {
  loginUser,
  registerUser,
  resendVerifyAccountOtp,
  verifyAccount,
  resendForgotPasswordOtp,
  forgotPassword,
  resetPassword 
} from "../controllers/user.controller.js";
import { customRateLimiter } from "../middleware/ratelimit.middleware.js";
import { validateFormData } from "../middleware/formvalidate.middleware.js";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  ValidateLoginSchema,
  validateSignupSchema,
} from "../lib/schemaValidation.js";
 

const router = Router();

router.post(
  "/register",
  customRateLimiter(10, 3),
  validateFormData(validateSignupSchema),
  registerUser,
);

router.post("/verify-account", customRateLimiter(10, 5), verifyAccount);

router.post(
  "/resend-verifyaccount-otp",
  customRateLimiter(5, 10),
  resendVerifyAccountOtp,
);

router.post(
  "/login",
  customRateLimiter(10, 3),
  validateFormData(ValidateLoginSchema),
  loginUser,
);



router.post(
  "/forgot-password",
  customRateLimiter(5, 1),
  validateFormData(forgotPasswordSchema),
  forgotPassword,
);

router.post(
  "/resend-otp",
  customRateLimiter(5, 1),
  validateFormData(forgotPasswordSchema),
  resendForgotPasswordOtp, // Reuses your resend OTP logic
);

router.post(
  "/reset-password",
  customRateLimiter(10, 3),
  validateFormData(resetPasswordSchema),
  resetPassword,
);

export default router;
