import { Router } from "express";
import {
  getMe,
  loginUser,
  registerUser,
  resendVerifyAccountOtp,
  verifyAccount,
  resendForgotPasswordOtp,
  forgotPassword,
  resetPassword,
  verifyForgotPasswordOtp,
  logoutUser,
} from "../controllers/user.controller.js";
import { customRateLimiter } from "../middleware/ratelimit.middleware.js";
import { validateFormData } from "../middleware/formvalidate.middleware.js";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateUserProfileSchema,
  ValidateLoginSchema,
  validateSignupSchema,
} from "../lib/schemaValidation.js";
import { isAuthenticated } from "../middleware/auth.middleware.js";
import {
  changePassword,
  deleteAvatar,
  getUserProfile,
  updateUserProfile,
  uploadAvatar,
} from "../controllers/profile.controller.js";
import { uploadMemoryParser } from "../services/cloudinary.service.js";

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

router.get("/profile", isAuthenticated, getUserProfile);

router.get("/me", isAuthenticated, getMe);

router.post(
  "/forgot-password",
  customRateLimiter(5, 10),
  validateFormData(forgotPasswordSchema),
  forgotPassword,
);

router.post(
  "/verify-forgotpassword-otp",
  customRateLimiter(10, 5),
  verifyForgotPasswordOtp,
);

router.post(
  "/resend-otp",
  customRateLimiter(5, 10),
  validateFormData(forgotPasswordSchema),
  resendForgotPasswordOtp,
);

router.post(
  "/reset-password",
  customRateLimiter(5, 10),
  validateFormData(resetPasswordSchema),
  resetPassword,
);

router.post(
  "/change-password",
  isAuthenticated,
  customRateLimiter(3, 15), //3 attempts per 15 minutes
  validateFormData(changePasswordSchema),
  changePassword,
);

router.patch(
  "/upload-avatar",
  isAuthenticated,
  customRateLimiter(5, 15), //5 attempts per 15 minutes
  uploadMemoryParser.single("avatar"),
  uploadAvatar,
),

router.patch(
  "/update-profile",
  isAuthenticated,
  customRateLimiter(3, 15), //3 attempts per 15 minutes
  validateFormData(updateUserProfileSchema),
  updateUserProfile,
);

router.delete("/delete-avatar", isAuthenticated, deleteAvatar);

router.post("/logout", isAuthenticated, logoutUser);

export default router;
