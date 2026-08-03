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
      pricePerBagPerWeek50kg,
      pricePerCratePerWeek50kg,
      priceWeeklyBulk100Plus,
      priceMonthly,
      //rating, reviewCount, and isVerified are left out here as per user configuration
    } = req.body;
    const files = req.files as Express.Multer.File[];

    // Explicitly check for uploaded assets
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

    // 3. Evaluate capacity limits (No Number() wrappers needed; Zod handles it!)
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

    // 5. Create new Hub using the flattened structure
    const newHub = await Hub.create({
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
      pricePerBagPerWeek50kg,
      pricePerCratePerWeek50kg,
      priceWeeklyBulk100Plus,
      priceMonthly,
      images: cloudinaryUrls,
      // rating, reviewCount, and isVerified fallback to schema defaults safely
    });

    return sendTsRestSuccess(res, 201, {
      message: "Storage Hub created successfully!",
      data: newHub,
    });
  },
);

export const getHubsGroupedByState = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    //fetch only the fields needed for the homepage cards to save memory and for optimization

    const hubs = await Hub.find()
      .select(
        "name address state lga totalCapacity availableCapacity unitType images storageType isVerified pricePerCratePerWeek50kg pricePerBagPerWeek50kg",
      )
      .sort({ createdAt: -1 })
      .lean();

    //map dictionary to collect states
    const stateGroups: { [key: string]: any[] } = {};

    //loop and group hubs by state name
    for (const hub of hubs) {
      const stateName = hub.state;

      if (!stateGroups[stateName]) {
        stateGroups[stateName] = [];
      }
      //limit the landing page row preview to a max of 4 hubs
      if (stateGroups[stateName].length < 4) {
        stateGroups[stateName].push(hub);
      }
    }
    //format into a clean array structure for frontend mapping
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


export const filterStorageHubs = tryCatchWrapper(
  async (req: Request, res: Response) => {
    // 1. Extract query params sent from the frontend FilterCapture component
    const { locationState, cropType, storageType } = req.query;

    // 2. Dynamically build the Mongoose query object
    const filterQuery: Record<string, any> = {};

    if (locationState) {
      // Case-insensitive exact state match
      filterQuery.state = { $regex: new RegExp(`^${locationState}$`, "i") };
    }

    if (storageType) {
      // Case-insensitive storage type match
      filterQuery.storageType = { $regex: new RegExp(`^${storageType}$`, "i") };
    }

    if (cropType) {
      // Searches inside array of supported crops
      filterQuery.supportedCrops = { $in: [new RegExp(cropType as string, "i")] };
    }

    // 3. Query database with active filters
    const hubs = await Hub.find(filterQuery)
      .select(
        "name address state lga totalCapacity availableCapacity unitType images storageType supportedCrops pricePerBagPerWeek50kg"
      )
      .sort({ createdAt: -1 });

    // 4. Send filtered JSON data back to frontend UI
    return sendTsRestSuccess(res, 200, {
      message: "Filtered storage hubs retrieved successfully",
      count: hubs.length,
      data: hubs,
    });
  }
);