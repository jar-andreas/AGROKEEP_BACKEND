import { Router } from "express";
// import all named controller exports as a single object
import * as profileController from "../controllers/profile.controller.js";
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