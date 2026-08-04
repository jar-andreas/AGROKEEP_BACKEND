import { Router } from "express";
import * as profilecontroller from "../controllers/profile.controller.js";
import { isAuthenticated } from "../middleware/auth.middleware.js";

const router = Router();

router.use(isAuthenticated);

// Get Profile Page Data
router.get("/overview", profilecontroller.getProfileOverview);

// Save All Changes (Combined endpoint)
router.put("/save-all", profilecontroller.updateAllProfileSettings);

// Logout User
router.post("/logout", profilecontroller.logoutUser);

export default router;