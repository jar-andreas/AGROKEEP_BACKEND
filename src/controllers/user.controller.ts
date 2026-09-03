import User from "../models/user.model.js";
import Otp from "../models/otp.model.js";
import { Request, Response, NextFunction } from "express";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { env } from "../config/keys.js";
import { sendOtpEmail, sendWelcomeEmail } from "../lib/email.js";

//generate a cryptographically random 6 digit OTP
const generateOtp = (): string => {
  return crypto.randomInt(100000, 999999).toString();
};

//hash OTP before saving to database-same approach as passwords
const hashOtp = async (otp: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(otp, salt);
};

export const registerUser = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const { fullName, email, phone, password } = req.body;
    const [emailExists, phoneExists] = await Promise.all([
      User.findOne({ email }),
      User.findOne({ phone }),
    ]);
    if (emailExists) {
      return sendTsRestError(res, 400, "Email already exists");
    }
    if (phoneExists) {
      return sendTsRestError(res, 400, "Phone Number already exists");
    }
    ///bcrypt password
    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);
    const newUser = await User.create({
      fullName,
      email,
      phone,
      password: hashPassword,
    });
    const otp = generateOtp();
    const hashedOtp = await hashOtp(otp);

    // Save the OTP to your database
    await Otp.create({
      email,
      otp: hashedOtp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10-minute expiry
    });

    // Dynamic verification link for your teammate's local environment
    const frontendUrl = env.FRONTEND_URL || "http://localhost:4600";
    const verificationLink = `${frontendUrl}/auth/verify-account?email=${encodeURIComponent(email)}`;

    // Send the email
    const emailSent = await sendWelcomeEmail(
      email,
      newUser.fullName,
      otp,
      verificationLink,
    );

    if (!emailSent) {
      // Logic choice: You could delete the user here if email fails,
      // but usually it's better to let them try "Resend OTP" later.
      return sendTsRestError(
        res,
        500,
        "User created but failed to send verification email.",
      );
    }
    //save session of user
    req.session.userId = newUser._id.toString();
    req.session.role = "client";

    req.session.save((err) => {
      if (err) {
        return next(err); // Hands off runtime issue to your global middleware error pipeline
      }
      return sendTsRestSuccess(res, 201, {
        message:
          "User registered successfully. Please check your email for a verification code.",
        data: {
          _id: newUser._id,
          email: newUser.email,
        },
      });
    });
  },
);

export const verifyAccount = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.query;
    const { otp } = req.body;

    if (!email || typeof email !== "string") {
      return sendTsRestError(res, 400, "Valid email parameter is missing.");
    }

    if (!otp) {
      return sendTsRestError(res, 400, "Verification code is required.");
    }

    const otpRecord = await Otp.findOne({ email });
    if (!otpRecord) {
      return sendTsRestError(res, 400, "Code not found or expired.");
    }

    // 2. Strict Expiry Verification (Catches MongoDB TTL lag)
    if (new Date() > otpRecord.expiresAt) {
      await Otp.deleteOne({ _id: otpRecord._id }); // Manually clean up right away
      return sendTsRestError(res, 400, "Verification code has expired.");
    }

    // 3. Brute-Force Check: Verify attempts aren't exhausted
    const MAX_ATTEMPTS = 3;
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      await Otp.deleteOne({ _id: otpRecord._id }); // Purge code for security
      return sendTsRestError(
        res,
        400,
        "Too many incorrect attempts. Please request a new verification code.",
      );
    }

    const isOtpValid = await bcrypt.compare(otp, otpRecord.otp);
    if (!isOtpValid) {
      // Increment failed attempts in the database
      otpRecord.attempts += 1;
      await otpRecord.save();

      const remainingAttempts = MAX_ATTEMPTS - otpRecord.attempts;
      return sendTsRestError(
        res,
        400,
        `Invalid verification code. ${remainingAttempts} attempts remaining.`,
      );
    }

    // 5. Atomic database changes on successful authentication
    await Promise.all([
      User.findOneAndUpdate({ email }, { emailVerified: true }),
      Otp.deleteOne({ _id: otpRecord._id }), // Clean up the verified token immediately
    ]);

    return sendTsRestSuccess(res, 200, {
      message: "Account verified successfully!",
    });
  },
);

export const resendVerifyAccountOtp = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;

    if (!email) {
      return sendTsRestError(res, 400, "Email address is required.");
    }

    // 1. Verify the user exists
    const user = await User.findOne({ email }).lean();
    if (!user) {
      // Return success to prevent email enumeration, same as forgotPassword
      return sendTsRestSuccess(res, 200, {
        message:
          "If an account with that email exists, a new OTP has been sent",
      });
    }

    // 2. Rate Limiting Check
    // Check if an OTP was sent very recently
    const existingOtp = await Otp.findOne({ email });
    if (existingOtp) {
      const timeElapsed =
        Date.now() - new Date(existingOtp.createdAt).getTime();
      const COOLDOWN_TIME = 60000; // 60 seconds

      if (timeElapsed < COOLDOWN_TIME) {
        const secondsLeft = Math.ceil((COOLDOWN_TIME - timeElapsed) / 1000);
        return sendTsRestError(
          res,
          429,
          `Please wait ${secondsLeft} seconds before requesting a new OTP.`,
        );
      }
      return sendTsRestError(
        res,
        429,
        "Please wait 60 seconds before requesting a new OTP",
      );
    }

    // 3. Delete any existing OTP for this email
    await Otp.deleteMany({ email });

    // 4. Generate + Hash new OTP
    const otp = generateOtp();
    const hashedOtp = await hashOtp(otp);

    // 5. Store new hashed OTP
    await Otp.create({
      email,
      otp: hashedOtp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0, // Reset attempts for the new code
    });

    // Construct the verification link
    // encodeURIComponent ensures special characters in the email don't break the URL
    const frontendUrl = env.FRONTEND_URL || "http://localhost:4600";
    const verificationLink = `${frontendUrl}/auth/verify-account?email=${encodeURIComponent(email)}`;

    const emailSent = await sendWelcomeEmail(
      email,
      user.fullName,
      otp,
      verificationLink,
    );

    if (!emailSent) {
      return sendTsRestError(res, 500, "Failed to send OTP. Please try again");
    }

    return sendTsRestSuccess(res, 200, {
      message: "A new OTP has been sent to your email",
    });
  },
);

export const loginUser = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendTsRestError(res, 400, "Email and password are required.");
    }

    // 1. Fetch user along with hidden password field
    const user = await User.findOne({ email }).select("+password");

    // Generic error message to prevent account enumeration / scanning
    if (!user) {
      return sendTsRestError(res, 401, "Invalid email or password.");
    }

    // 2. Validate password credentials
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return sendTsRestError(res, 401, "Invalid email or password.");
    }

    // 3. Operational Guard: Enforce email verification status
    if (!user.emailVerified) {
      return sendTsRestError(
        res,
        403,
        "Your account email has not been verified yet. Please check your inbox for an activation code.",
      );
    }

    // 4. Strip sensitive data fields out safely
    const userResponse = user.toObject();
    delete (userResponse as any).password;

    // 5. Store session parameters matching your flat global types
    req.session.userId = user._id.toString();
    req.session.role = user.role || "admin";

    // 6. Explicitly persist session payload to MongoDB before delivering network response
    req.session.save((err) => {
      if (err) {
        return next(err); // Hands off runtime issue to your global middleware error pipeline
      }

      return sendTsRestSuccess(res, 200, {
        message: "User logged in successfully.",
        data: userResponse,
      });
    });
  },
);

//get me
export const getMe = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.userId;

    const user = await User.findById(userId).lean();
    if (!user) {
      return sendTsRestError(res, 404, "User not found");
    }
    return sendTsRestSuccess(res, 200, {
      message: "User retrieved successfully",
      data: user,
    });
  },
);

export const forgotPassword = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;

    if (!email) {
      return sendTsRestError(res, 400, "Email address is required.");
    }

    // 1. Verify user exists
    const user = await User.findOne({ email }).lean();
    if (!user) {
      // Security Best Practice: Generic message prevents user enumeration
      return sendTsRestSuccess(res, 200, {
        message:
          "If an account with that email exists, a password reset OTP has been sent.",
      });
    }

    // 2. Clear any lingering stale password tokens for this email
    await Otp.deleteMany({ email });

    // 3. Securely generate and hash the reset OTP
    const otp = generateOtp();
    const hashedOtp = await hashOtp(otp);

    // 4. Save to the Otp collection with a 15-minute expiration window
    await Otp.create({
      email,
      otp: hashedOtp,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15-minute window
      attempts: 0,
    });

    // 5. Construct structural frontend link for context parameters
    const frontendUrl = env.FRONTEND_URL || "http://localhost:4600";
    const resetLink = `${frontendUrl}/auth/verify-forgotpassword-otp?email=${encodeURIComponent(email)}`;

    // 6. Send email notification (reusing or swapping your core mail layout utility)
    const emailSent = await sendOtpEmail(email, user.fullName, otp, resetLink);

    if (!emailSent) {
      return sendTsRestError(
        res,
        500,
        "Failed to send recovery OTP. Please try again later.",
      );
    }

    return sendTsRestSuccess(res, 200, {
      message:
        "If an account with that email exists, a password reset OTP and a verification link has been sent to your email.",
    });
  },
);

export const resendForgotPasswordOtp = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;

    if (!email) {
      return sendTsRestError(res, 400, "Email address is required.");
    }

    // 1. Verify the user exists in your database
    const user = await User.findOne({ email }).lean();
    if (!user) {
      // Security Best Practice: Return success to prevent account enumeration
      return sendTsRestSuccess(res, 200, {
        message:
          "If an account with that email exists, a new recovery OTP has been sent.",
      });
    }

    // 2. Cooldown Rate-Limiting Guard
    // Check if an OTP document already exists to enforce a 60-second delay
    const existingOtp = await Otp.findOne({ email });
    if (existingOtp) {
      const timeElapsed =
        Date.now() - new Date(existingOtp.createdAt).getTime();
      const COOLDOWN_TIME = 60000; // 60 seconds

      if (timeElapsed < COOLDOWN_TIME) {
        const secondsLeft = Math.ceil((COOLDOWN_TIME - timeElapsed) / 1000);
        return sendTsRestError(
          res,
          429,
          `Please wait ${secondsLeft} seconds before requesting a new recovery code.`,
        );
      }
    }

    // 3. Purge the old token mapping record
    await Otp.deleteMany({ email });

    // 4. Generate & Hash the fresh reset OTP
    const otp = generateOtp();
    const hashedOtp = await hashOtp(otp);

    // 5. Commit fresh token payload to the collection
    await Otp.create({
      email,
      otp: hashedOtp,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // Fresh 15-minute window
      attempts: 0, // Reset brute-force counter back to 0
    });

    // 6. Build the target frontend parameter string
    const frontendUrl = env.FRONTEND_URL || "http://localhost:4600";
    const resetLink = `${frontendUrl}/auth/verify-forgotpassword-otp?email=${encodeURIComponent(email)}`;

    // 7. Dispatch notification via email utility
    const emailSent = await sendOtpEmail(email, user.fullName, otp, resetLink);

    if (!emailSent) {
      return sendTsRestError(
        res,
        500,
        "Failed to deliver recovery OTP. Please try again.",
      );
    }

    return sendTsRestSuccess(res, 200, {
      message:
        "A new password reset OTP and verification link has been sent to your email.",
    });
  },
);

export const verifyForgotPasswordOtp = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.query;
    const { otp } = req.body;

    // Safety check for the URL parameter
    if (!email) {
      return sendTsRestError(
        res,
        400,
        "Email parameter is missing from the URL.",
      );
    }

    const otpRecord = await Otp.findOne({ email });
    if (!otpRecord) {
      return sendTsRestError(res, 400, "OTP not found or has expired");
    }
    //check expiry explicity as a safety net
    if (otpRecord.expiresAt < new Date()) {
      await Otp.deleteMany({ email });
      return sendTsRestError(
        res,
        400,
        "OTP has expired.Please request a new one",
      );
    }
    //max 5 attempts before invalidating
    if (otpRecord.attempts >= 5) {
      await Otp.deleteMany({ email });
      return sendTsRestError(
        res,
        400,
        "Too many incorrect attempts .Please request a new OTP",
      );
    }
    const isOtpValid = await bcrypt.compare(otp, otpRecord.otp);
    if (!isOtpValid) {
      //increment attempts
      await Otp.updateOne({ email }, { $inc: { attempts: 1 } });
      const remainingAttempts = 5 - (otpRecord.attempts + 1);
      return sendTsRestError(
        res,
        400,
        `Invalid OTP. You have ${remainingAttempts} attempts left.`,
      );
    }
    //OTP is valid-store verified email in session for the reset step
    req.session.resetEmail = email as string;

    //clean up OTP
    await Otp.deleteMany({ email });
    return sendTsRestSuccess(res, 200, {
      message: "Otp verified successfully.You may now reset your password",
    });
  },
);

export const resetPassword = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.query;
    // 1. Destructure both parameters from the request body
    const { newPassword, confirmPassword } = req.body;

    if (!email || typeof email !== "string") {
      return sendTsRestError(res, 400, "Valid email parameter is missing.");
    }

    if (!newPassword || !confirmPassword) {
      return sendTsRestError(
        res,
        400,
        "New password and confirm password are required.",
      );
    }

    // 2. Exact Match Operational Guard: Validate string symmetry
    if (newPassword !== confirmPassword) {
      return sendTsRestError(
        res,
        400,
        "Passwords do not match. Please ensure both fields are identical.",
      );
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return sendTsRestError(res, 404, "User not found");
    }
    //prevent reusing the same password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return sendTsRestError(
        res,
        400,
        "New password must be different from the old password",
      );
    }
    //hash new password
    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashPassword;
    await user.save();

    return sendTsRestSuccess(res, 200, {
      message: "Password reset successfully. You can now log in",
    });
  },
);

export const logoutUser = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    req.session.destroy((err) => {
      if (err) {
        return sendTsRestError(res, 500, "Could not log out. Please try again");
      }
      res.clearCookie("sessionId"); //matches the cookie name in session.ts
      return sendTsRestSuccess(res, 200, {
        message: "User logged out successfully",
      });
    });
  },
);
