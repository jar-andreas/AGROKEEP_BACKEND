import { Router } from "express";
import {
  createAdminStorageHub,
  getAdminHubDetail,
  getAdminHubsList,
  getHubActivityLog,
  getHubFilterOptions,
  sendHubContactEmail,
  updateAdminStorageHub,
  uploadHubDocument,
  verifyHubDocument,
} from "../controllers/adminStorageHub.controller.js";
import {
  adminHubsListQuerySchema,
  createHubValidationSchema,
  hubDocumentParamSchema,
  hubIdParamSchema,
  sendBookingEmailSchema,
  updateAdminHubSchema,
  uploadHubDocumentSchema,
} from "../lib/schemaValidation.js";
import { isAdmin, isAuthenticated } from "../middleware/auth.middleware.js";
import { customRateLimiter } from "../middleware/ratelimit.middleware.js";
import { uploadDocumentParser } from "../services/cloudinary.service.js";
import {
  validateFormData,
  validateParams,
  validateQueryParams,
} from "../middleware/formvalidate.middleware.js";

const router = Router();

router.get(
  "/filter-options",
  isAuthenticated,
  isAdmin,
  getHubFilterOptions,
);

router.get(
  "/",
  isAuthenticated,
  isAdmin,
  validateQueryParams(adminHubsListQuerySchema),
  getAdminHubsList,
);

router.post(
  "/create",
  isAuthenticated,
  isAdmin,
  validateFormData(createHubValidationSchema),
  createAdminStorageHub,
);

router.get(
  "/:id",
  isAuthenticated,
  isAdmin,
  validateParams(hubIdParamSchema),
  getAdminHubDetail,
);

router.patch(
  "/:id",
  isAuthenticated,
  isAdmin,
  validateParams(hubIdParamSchema),
  validateFormData(updateAdminHubSchema),
  updateAdminStorageHub,
);

router.post(
  "/:id/documents",
  isAuthenticated,
  isAdmin,
  customRateLimiter(20, 10),
  validateParams(hubIdParamSchema),
  uploadDocumentParser.array("files", 10),
  validateFormData(uploadHubDocumentSchema),
  uploadHubDocument,
);

router.get(
  "/:id/activity-log",
  isAuthenticated,
  isAdmin,
  validateParams(hubIdParamSchema),
  getHubActivityLog,
);

router.patch(
  "/:id/documents/:docId/verify",
  isAuthenticated,
  isAdmin,
  validateParams(hubDocumentParamSchema),
  verifyHubDocument,
);

router.post(
  "/:id/email",
  isAuthenticated,
  isAdmin,
  customRateLimiter(20, 10),
  validateParams(hubIdParamSchema),
  validateFormData(sendBookingEmailSchema),
  sendHubContactEmail,
);

export default router;
