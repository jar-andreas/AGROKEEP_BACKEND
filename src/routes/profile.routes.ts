import { Router } from "express";
// import controller members via require to avoid strict named-export checks
const profileController: any = require("../controllers/profile.controller.js");
import { isAuthenticated } from "../middleware/auth.middleware.js";

const router = Router();

// Protect all profile endpoints with auth middleware
router.use(isAuthenticated);

// Individual profile routes
router.get("/overview", profileController.getProfileOverview);
router.patch("/personal-info", profileController.updatePersonalInfo);
router.patch("/notification-preferences", profileController.updateNotificationPreferences);
router.patch("/change-password", profileController.changePassword);

// Combined save route

// Logout route
router.put("/save-all", profileController.updateAllProfileSettings);

router.post("/logout", profileController.logoutUser);

export default router;