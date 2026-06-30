import { Request, Response, NextFunction } from "express";
import { OAuth2Client } from "google-auth-library";
import User from "../models/user.model.js";
import { sendTsRestError } from "../lib/responseHandler.js";
import { env } from "../config/keys.js";
import tryCatchWrapper from "src/lib/tryCatchWrapper.js";

// Initialize the Google OAuth2 client with your credentials
const client = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_CALLBACK_URL,
);

/**
 * PHASE 1: Initiate Google Login
 * Route: GET /api/auth/google
 */
export const initiateGoogleAuth = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const authorizeUrl = client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      prompt: "select_account",
    });

    // Redirect the browser window to Google's sign-in consent page
    return res.redirect(authorizeUrl);
  },
);

/**
 * PHASE 2: Handle Google Callback, Create/Find User & Save Session
 * Route: GET /api/auth/google/callback
 */
export const handleGoogleCallback = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const { code } = req.query;

    if (!code || typeof code !== "string") {
      return sendTsRestError(res, 400, "Google authorization code missing.");
    }
    // 1. Exchange the authorization code for security tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // 2. Verify the cryptographic ID token to get user profile fields safely
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return sendTsRestError(
        res,
        400,
        "Failed to retrieve user payload from Google.",
      );
    }

    const { email, name, picture } = payload;

    // 3. Check if user already exists in your MongoDB database
    let user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      // Create user record immediately if signing up for the first time
      user = await User.create({
        fullName: name || "Google User",
        email: email.toLowerCase().trim(),
        avatar: picture,
        emailVerified: true, // Accounts originating from Google are pre-verified
        password: "oauth_placeholder_disabled_" + Math.random().toString(36), // Secure placeholder string
      });
    }

    // 4. Save information to your flat express-session parameters
    req.session.userId = user._id.toString();
    req.session.role = user.role || "client";

    // 5. Force session save to MongoDB before completing the browser redirect
    req.session.save((err) => {
      if (err) return next(err);

      // Bounce the user directly to the running frontend dashboard application URL
      const frontendDashboard =
        env.FRONTEND_URL || "http://localhost:4600";
      return res.redirect(frontendDashboard);
    });
  },
);
