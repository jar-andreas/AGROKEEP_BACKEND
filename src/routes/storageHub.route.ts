import { Router } from "express";
import {
  deleteStorageHub,
  filterStorageHubs,
  getAllStorageHubs,
  getHubsGroupedByState,
  getSingleHubBySlug,
  getVerifiedHubs,
} from "../controllers/storageHub.controller.js";
import { isAdmin, isAuthenticated } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/verified-hubs", getVerifiedHubs);

router.get("/grouped-by-state", getHubsGroupedByState);

router.get("/all", getAllStorageHubs);

router.get("/filter", filterStorageHubs);

router.delete("/:id", isAdmin, isAuthenticated, deleteStorageHub);

router.get("/:slug", getSingleHubBySlug);

export default router;
