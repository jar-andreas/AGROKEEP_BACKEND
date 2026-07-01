import User from "../models/user.model.js";
import Otp from "../models/otp.model.js";
import { Request, Response, NextFunction } from "express";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { env } from "../config/keys.js";
import { sendWelcomeEmail } from "../lib/email.js";

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
    const verificationLink = `${frontendUrl}/auth/verify-Account?email=${encodeURIComponent(email)}`;

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
    const verificationLink = `${frontendUrl}/auth/verify-Account?email=${encodeURIComponent(email)}`;

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
    req.session.role = user.role || "client";

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
