import Hub from "../models/storageHub.model.js";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { uploadToCloudinary } from "../services/cloudinary.service.js";
import { NextFunction, Request, Response } from "express";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";

export const createStorageHub = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const {
      name,
      address,
      state,
      lga,
      storageType,
      aboutFacility,
      proximityText,
      operatingHours,
      totalCapacity,
      availableCapacity,
      unitType,
      rating,
      reviewCount,
      supportedCrops,
      features,
      whatsIncluded,
      specStorageMethod,
      specFacilitySize,
      specClimateControl,
      specSecurity,
      specAccessibility,
      specNearestMajorMarket,
      pricePerBagPerDay,
      pricePerCratePerDay,
    } = req.body;
    const files = req.files as Express.Multer.File[];

    // 1. Explicitly check for uploaded assets
    if (!files || files.length === 0) {
      return sendTsRestError(
        res,
        400,
        "At least one facility display image is required",
      );
    }

    // 2. Prevent exact duplicate hubs
    const existingHub = await Hub.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      address: { $regex: new RegExp(`^${address}$`, "i") },
    }).lean();

    if (existingHub) {
      return sendTsRestError(
        res,
        409,
        "A storage hub with this exact name and address already exists",
      );
    }

    // 3. Evaluate capacity limits
    const total = totalCapacity;
    const available =
      availableCapacity !== undefined ? availableCapacity : total;

    if (available > total) {
      return sendTsRestError(
        res,
        400,
        "Available capacity cannot exceed the total capacity of the hub",
      );
    }

    // 4. Process image uploads to Cloudinary concurrently
    const uploadPromises = files.map((file) => uploadToCloudinary(file.buffer));
    const cloudinaryUrls = await Promise.all(uploadPromises);

    // 5. Create new Hub instance and save (Triggers schema pre-save hook for pricing & slug)
    const newHub = new Hub({
      name,
      address,
      state,
      lga,
      storageType,
      aboutFacility,
      proximityText,
      operatingHours,
      totalCapacity: total,
      availableCapacity: available,
      unitType,
      supportedCrops,
      rating,
      reviewCount,
      features,
      whatsIncluded,
      specStorageMethod,
      specFacilitySize,
      specClimateControl,
      specSecurity,
      specAccessibility,
      specNearestMajorMarket,
      pricePerBagPerDay,
      pricePerCratePerDay,
      images: cloudinaryUrls,
    });

    await newHub.save();

    return sendTsRestSuccess(res, 201, {
      message: "Storage Hub created successfully!",
      data: newHub,
    });
  },
);

export const getVerifiedHubs = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const { isVerified, limit } = req.query;

    // Build filter criteria
    const filter: Record<string, any> = {
      isVerified: isVerified !== undefined ? isVerified === "true" : true,
    };

    // Safely parse limit (defaults to 3, falls back to 3 if limit is NaN)
    const parsedLimit = limit ? parseInt(limit as string, 10) : 3;
    const limitNumber = isNaN(parsedLimit) ? 3 : parsedLimit;

    const hubs = await Hub.find(filter)
      .lean()
      .sort({ createdAt: -1 })
      .limit(limitNumber);

    if (!hubs || hubs.length === 0) {
      return sendTsRestError(
        res,
        404,
        "There are no available verified storage hubs",
      );
    }
    return sendTsRestSuccess(res, 200, {
      status: "success",
      message: "Hubs retrieved successfully",
      data: hubs,
    });
  },
);

export const getHubsGroupedByState = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    // Select correct flattened pricing fields
    const hubs = await Hub.find()
      .select(
        "name address state lga totalCapacity availableCapacity unitType images storageType isVerified pricePerCratePerDay pricePerBagPerDay priceBulk100Units priceWeeklyFlat rating reviewCount slug",
      )
      .sort({ createdAt: -1 })
      .lean();

    const stateGroups: { [key: string]: any[] } = {};

    for (const hub of hubs) {
      const stateName = hub.state;

      if (!stateGroups[stateName]) {
        stateGroups[stateName] = [];
      }
      if (stateGroups[stateName].length < 4) {
        stateGroups[stateName].push(hub);
      }
    }

    const formattedData = Object.keys(stateGroups).map((state) => ({
      state: state,
      hubs: stateGroups[state],
    }));

    return sendTsRestSuccess(res, 200, {
      message: "Hubs grouped by state retrieved successfully",
      data: formattedData,
    });
  },
);

export const getSingleHubBySlug = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const { slug } = req.params;

    const hub = await Hub.findOne({ slug }).lean();

    if (!hub) {
      return sendTsRestError(res, 404, "Storage Hub not found");
    }

    // Fetch 3 similar hubs in the same state using corrected schema projection
    const similarHubs = await Hub.find({
      state: hub.state,
      _id: { $ne: hub._id },
    })
      .select(
        "name state lga totalCapacity availableCapacity unitType images storageType pricePerBagPerDay pricePerCratePerDay priceBulk100Units priceWeeklyFlat rating reviewCount isVerified slug",
      )
      .limit(3)
      .lean();

    return sendTsRestSuccess(res, 200, {
      message: "Storage Hub details retrieved successfully",
      data: { ...hub, similarFacilities: similarHubs },
    });
  },
);

export const getAllStorageHubs = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const hubs = await Hub.find().sort({ createdAt: -1 }).lean();

    if (hubs.length === 0) {
      return sendTsRestSuccess(res, 200, {
        message: "No storage hubs found",
        data: [],
      });
    }

    // FIXED: Return response when hubs are present
    return sendTsRestSuccess(res, 200, {
      message: "Storage hubs retrieved successfully",
      count: hubs.length,
      data: hubs,
    });
  },
);

export const updateStorageHub = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const hub = await Hub.findById(id);

    if (!hub) {
      return sendTsRestError(
        res,
        404,
        "Storage Hub could not be updated because it doesn't exist",
      );
    }

    // Apply updates and call save() to trigger schema pre-save pricing hook
    Object.assign(hub, req.body);
    await hub.save();

    return sendTsRestSuccess(res, 200, {
      message: "Storage Hub updated successfully",
      data: hub,
    });
  },
);

export const deleteStorageHub = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const deletedHub = await Hub.findByIdAndDelete(id).lean();

    if (!deletedHub) {
      return sendTsRestError(
        res,
        404,
        "Storage hub could not be deleted because it doesn't exist",
      );
    }
    return sendTsRestSuccess(res, 200, {
      message: "Storage Hub deleted successfully",
      data: null,
    });
  },
);

const escapeRegex = (text: string) =>
  text.replace(/[-[\]{}()*+?^$|#\s]/g, "\\$&");

export const filterStorageHubs = tryCatchWrapper(
  async (req: Request, res: Response) => {
    const { locationState, cropType, storageType } = req.query;

    const filterQuery: Record<string, any> = {};

    if (
      locationState &&
      typeof locationState === "string" &&
      locationState.trim() !== ""
    ) {
      const safeState = escapeRegex(locationState.trim());
      filterQuery.state = { $regex: new RegExp(`^${safeState}$`, "i") };
    }

    if (
      storageType &&
      typeof storageType === "string" &&
      storageType.trim() !== ""
    ) {
      const safeStorageType = escapeRegex(storageType.trim());
      filterQuery.storageType = {
        $regex: new RegExp(`^${safeStorageType}$`, "i"),
      };
    }

    if (cropType && typeof cropType === "string" && cropType.trim() !== "") {
      const safeCrop = escapeRegex(cropType.trim());
      filterQuery.supportedCrops = { $regex: safeCrop, $options: "i" };
    }

    // Updated with corrected schema fields
    const hubs = await Hub.find(filterQuery)
      .select(
        "name state lga storageType totalCapacity availableCapacity unitType pricePerBagPerDay pricePerCratePerDay priceBulk100Units priceWeeklyFlat rating reviewCount isVerified images slug",
      )
      .sort({ createdAt: -1 })
      .lean();

    if (hubs.length === 0) {
      return sendTsRestSuccess(res, 200, {
        message:
          "No storage hubs match your search criteria. Try adjusting your filters.",
        count: 0,
        data: [],
      });
    }

    return sendTsRestSuccess(res, 200, {
      message: "Filtered storage hubs retrieved successfully",
      count: hubs.length,
      data: hubs,
    });
  },
);
