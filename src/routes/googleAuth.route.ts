import { Router } from "express";
import { initiateGoogleAuth, handleGoogleCallback } from "../controllers/googleAuth.controller.js";

const authRouter = Router();

// Endpoint that the frontend button triggers
authRouter.get("/google", initiateGoogleAuth);

// Endpoint that matches the Authorized Redirect URI in your Google Cloud screenshot
authRouter.get("/google/callback", handleGoogleCallback);

export default authRouter;