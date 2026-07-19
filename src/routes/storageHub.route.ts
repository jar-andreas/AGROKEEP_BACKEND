import { Router } from "express";
import {
  createStorageHub,
  getHubsGroupedByState,
} from "../controllers/storageHub.controller.js";
import { validateFormData } from "../middleware/formvalidate.middleware.js";
import { createHubValidationSchema } from "../lib/schemaValidation.js";
import { uploadMemoryParser } from "../services/cloudinary.service.js";
import { isAdmin, isAuthenticated } from "../middleware/auth.middleware.js";

const router = Router();

router.post(
  "/create",
  isAdmin,
  isAuthenticated,
  uploadMemoryParser.array("images", 5),
  validateFormData(createHubValidationSchema),
  createStorageHub,
);

router.get("/grouped-by-state", isAuthenticated, getHubsGroupedByState);

export default router;
