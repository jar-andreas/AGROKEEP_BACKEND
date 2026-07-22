import { Router } from "express";
import {
  createStorageHub,
  deleteStorageHub,
  filterStorageHubs,
  getAllStorageHubs,
  getHubsGroupedByState,
  getSingleHubBySlug,
  updateStorageHub,
} from "../controllers/storageHub.controller.js";
import { validateFormData } from "../middleware/formvalidate.middleware.js";
import {
  createHubValidationSchema,
  updateHubValidationSchema,
} from "../lib/schemaValidation.js";
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

router.get("/all", isAuthenticated, getAllStorageHubs);

router.get("/filter", isAuthenticated, filterStorageHubs);

router.patch(
  "/:id",
  isAdmin,
  isAuthenticated,
  validateFormData(updateHubValidationSchema),
  updateStorageHub,
);


router.delete("/:id", isAdmin, isAuthenticated, deleteStorageHub);

router.get("/:slug", isAuthenticated, getSingleHubBySlug);

export default router;
