import mongoose from "mongoose";
import { Request, Response } from "express";
import tryCatchWrapper from "../lib/tryCatchWrapper.js";
import { sendTsRestError, sendTsRestSuccess } from "../lib/responseHandler.js";
import Hub, {
  HUB_STATUSES,
  HUB_VERIFICATION_STATUSES,
} from "../models/storageHub.model.js";
import Booking from "../models/booking.model.js";
import { uploadDocumentToCloudinary } from "../services/cloudinary.service.js";
import { sendAdminCustomMessageEmail } from "../lib/email.js";
import {
  AdminHubsListQuery,
  CreateHubInput,
  HubDocumentParam,
  HubIdParam,
  SendBookingEmailInput,
  UpdateAdminHubInput,
  UploadHubDocumentInput,
} from "../lib/schemaValidation.js";

const escapeRegex = (text: string) =>
  text.replace(/[-[\]{}()*+?^$|#\s]/g, "\\$&");

const HUB_VERIFICATION_STATUS_LABELS: Record<
  (typeof HUB_VERIFICATION_STATUSES)[number],
  string
> = {
  verified: "Verified",
  pending: "Pending",
  needs_update: "Needs Update",
};

const HUB_STATUS_LABELS: Record<(typeof HUB_STATUSES)[number], string> = {
  active: "Active",
  suspended: "Suspended",
  deactivated: "Deactivated",
  inactive: "Inactive",
};

// Powers the Storage Hubs list page's whole filter bar in one call — same
// pattern as /admin/booking-filter-options on the Bookings page: canonical
// {label, value} pairs for the two status enums (so the frontend never
// hardcodes/guesses them), a distinct storage-type list, and the same
// {state, lga} location pairs used for the create-booking modal's cascade,
// reused here for the State/LGA filter dropdowns.
export const getHubFilterOptions = tryCatchWrapper(
  async (_req: Request, res: Response) => {
    const [storageTypes, cropTypes, locations] = await Promise.all([
      Hub.distinct("storageType"),
      Hub.distinct("supportedCrops"),
      Hub.aggregate([
        { $group: { _id: { state: "$state", lga: "$lga" } } },
        { $sort: { "_id.state": 1, "_id.lga": 1 } },
        { $project: { _id: 0, state: "$_id.state", lga: "$_id.lga" } },
      ]),
    ]);

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: "Storage hub filter options retrieved successfully",
      data: {
        storageTypes: storageTypes.sort((a, b) => a.localeCompare(b)),
        cropTypes: cropTypes.sort((a, b) => a.localeCompare(b)),
        locations,
        verificationStatuses: HUB_VERIFICATION_STATUSES.map((value) => ({
          value,
          label: HUB_VERIFICATION_STATUS_LABELS[value],
        })),
        statuses: HUB_STATUSES.map((value) => ({
          value,
          label: HUB_STATUS_LABELS[value],
        })),
      },
    });
  },
);

// Wizard Step 1 "Information" — plain JSON, no files. Facility photos are
// no longer collected here; they're uploaded in Step 2 as a
// "facility_photos" document (see uploadHubDocument below), which also
// backfills this hub's main `images` gallery. That split exists because a
// single multer instance can't parse two different file-filter configs
// (this route has none at all) in one request.
export const createAdminStorageHub = tryCatchWrapper(
  async (req: Request<{}, {}, CreateHubInput>, res: Response) => {
    const {
      name,
      address,
      latitude,
      longitude,
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
      hubOwnerName,
      contactPersonName,
      contactPhoneNumber,
      contactEmail,
    } = req.body;
    const adminUserId = req.session.userId as string;

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

    const newHub = new Hub({
      name,
      address,
      latitude,
      longitude,
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
      images: [],
      hubOwnerName,
      contactPersonName,
      contactPhoneNumber,
      contactEmail,
      // Always starts awaiting review, even though the schema's own
      // default (for hubs that predate this field) is "verified".
      verificationStatus: "pending",
      activityLog: [
        {
          action: "hub_created",
          performedBy: new mongoose.Types.ObjectId(adminUserId),
          details: "Storage hub created",
          createdAt: new Date(),
        },
      ],
    } as any);

    await newHub.save();

    return sendTsRestSuccess(res, 201, {
      success: true,
      message: "Storage hub created successfully",
      data: newHub,
    });
  },
);

// Admin dashboard's Storage Hubs list page: filterable/paginated, with a
// per-hub booking count the public-facing hub endpoints never needed.
export const getAdminHubsList = tryCatchWrapper(
  async (req: Request<{}, {}, {}, AdminHubsListQuery>, res: Response) => {
    const { search, state, lga, storageType, verificationStatus, status } =
      req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};

    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { name: searchRegex },
        { address: searchRegex },
        { lga: searchRegex },
        { state: searchRegex },
        { storageType: searchRegex },
      ];
    }

    if (state) {
      filter.state = { $regex: new RegExp(`^${escapeRegex(state)}$`, "i") };
    }
    if (lga) {
      filter.lga = { $regex: new RegExp(`^${escapeRegex(lga)}$`, "i") };
    }
    if (storageType) {
      filter.storageType = {
        $regex: new RegExp(`^${escapeRegex(storageType)}$`, "i"),
      };
    }
    if (verificationStatus) filter.verificationStatus = verificationStatus;
    if (status) filter.status = status;

    const [hubs, total] = await Promise.all([
      Hub.find(filter)
        .select(
          "name state lga storageType totalCapacity availableCapacity unitType verificationStatus status createdAt",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Hub.countDocuments(filter),
    ]);

    // Per-hub booking count, mirroring the countDocuments-by-status idiom
    // already used in admin.controller.ts / booking.controller.ts.
    const hubIds = hubs.map((h) => h._id);
    const bookingCounts = await Booking.aggregate([
      { $match: { hub: { $in: hubIds } } },
      { $group: { _id: "$hub", count: { $sum: 1 } } },
    ]);
    const countByHub = new Map<string, number>(
      bookingCounts.map((b) => [String(b._id), b.count]),
    );

    const hubsWithCounts = hubs.map((hub) => ({
      ...hub,
      bookingsCount: countByHub.get(String(hub._id)) ?? 0,
    }));

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: hubsWithCounts.length
        ? "Storage hubs retrieved successfully"
        : "No storage hubs matching criteria",
      data: {
        hubs: hubsWithCounts,
        pagination: {
          total,
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
          limit,
        },
      },
    });
  },
);

// One bundled response for all 4 detail-page tabs (Overview, Location &
// Contact, Verification Documents, Activity Log) — mirrors
// getSingleBookingAdmin's "one big response" shape, so the frontend loads
// the whole page in one fetch and tabs just switch which section renders.
export const getAdminHubDetail = tryCatchWrapper(
  async (req: Request<HubIdParam>, res: Response) => {
    const { id } = req.params;

    const hub = await Hub.findById(id).populate<{
      verificationDocuments: {
        verifiedBy: { _id: mongoose.Types.ObjectId; fullName: string } | null;
      }[];
    }>({ path: "verificationDocuments.verifiedBy", select: "fullName" });

    if (!hub) {
      return sendTsRestError(res, 404, "Storage Hub not found");
    }

    const [activeBookingsCount, recentBookings] = await Promise.all([
      Booking.countDocuments({
        hub: hub._id,
        bookingStatus: { $in: ["in_storage"] },
      }),
      Booking.find({ hub: hub._id })
        .select(
          "bookingId fullName cropType quantity unitType dropOffDate durationInDays totalAmount bookingStatus",
        )
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    const occupancyPercent =
      hub.totalCapacity > 0
        ? Math.round(
            ((hub.totalCapacity - hub.availableCapacity) / hub.totalCapacity) *
              100,
          )
        : 0;

    // Every row in recentBookings belongs to this same hub, so its LOCATION
    // and STORAGE HUB columns are identical for all of them — computed once
    // here instead of re-selecting them per booking.
    const hubLocation = `${hub.lga}, ${hub.state}`;
    const recentBookingsWithLocation = recentBookings.map((booking) => ({
      ...booking,
      hubName: hub.name,
      location: hubLocation,
    }));

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: "Storage hub details retrieved successfully",
      data: {
        id: hub._id,
        name: hub.name,
        images: hub.images,
        aboutFacility: hub.aboutFacility,
        verificationStatus: hub.verificationStatus,
        status: hub.status,

        overview: {
          occupancyPercent,
          availableCapacity: hub.availableCapacity,
          totalCapacity: hub.totalCapacity,
          unitType: hub.unitType,
          activeBookingsCount,
          storageType: hub.storageType,
          features: hub.features,
          pricePerBagPerDay: hub.pricePerBagPerDay,
          pricePerCratePerDay: hub.pricePerCratePerDay,
          priceBulk100Units: hub.priceBulk100Units,
          priceWeeklyFlat: hub.priceWeeklyFlat,
          supportedCrops: hub.supportedCrops,
          recentBookings: recentBookingsWithLocation,
        },

        locationContact: {
          state: hub.state,
          lga: hub.lga,
          address: hub.address,
          latitude: hub.latitude,
          longitude: hub.longitude,
          proximityText: hub.proximityText,
          hubOwnerName: hub.hubOwnerName,
          contactPersonName: hub.contactPersonName,
          contactPhoneNumber: hub.contactPhoneNumber,
          contactEmail: hub.contactEmail,
        },

        verificationDocuments: hub.verificationDocuments,
      },
    });
  },
);

// Single "Edit Hub" endpoint — general fields (name, address, pricing,
// capacity, features, specs, contact info) AND the two status dropdowns
// (verificationStatus, status) in one PATCH, so an admin can e.g. update
// pricing and suspend the hub in the same save instead of firing three
// separate requests. Each category of change that's actually present still
// gets its own purpose-built activityLog entry rather than one generic
// line, so "what happened" stays as readable as when these were split.
// Activity Log tab has its own real pagination in the mockup ("Showing
// 1-10 of 12 Activities" + page numbers), unlike the Overview tab's
// "recent 5, view all" Bookings table — so this is a separate endpoint
// rather than bundled into getAdminHubDetail, which would otherwise return
// this hub's entire history on every single page load regardless of which
// tab is open. Still fully scoped to the one hub via :id, same as
// /documents and /email below.
export const getHubActivityLog = tryCatchWrapper(
  async (req: Request<HubIdParam>, res: Response) => {
    const { id } = req.params;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const hub = await Hub.findById(id)
      .select("activityLog")
      .populate<{
        activityLog: {
          _id: mongoose.Types.ObjectId;
          action: string;
          details: string;
          createdAt: Date;
          performedBy: { _id: mongoose.Types.ObjectId; fullName: string };
        }[];
      }>({ path: "activityLog.performedBy", select: "fullName" });

    if (!hub) {
      return sendTsRestError(res, 404, "Storage Hub not found");
    }

    const sorted = [...hub.activityLog].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const total = sorted.length;
    const skip = (page - 1) * limit;
    const paginated = sorted.slice(skip, skip + limit);

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: "Activity log retrieved successfully",
      data: {
        activityLog: paginated,
        pagination: {
          total,
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
          limit,
        },
      },
    });
  },
);

export const updateAdminStorageHub = tryCatchWrapper(
  async (req: Request<HubIdParam, {}, UpdateAdminHubInput>, res: Response) => {
    const { id } = req.params;
    const adminUserId = req.session.userId as string;
    const {
      verificationStatus,
      status,
      reason,
      maintenanceStart,
      maintenanceEnd,
      ...generalUpdates
    } = req.body;

    const hub = await Hub.findById(id);
    if (!hub) {
      return sendTsRestError(res, 404, "Storage Hub not found");
    }

    const logEntries: { action: string; details: string }[] = [];

    // 1. General field edits
    const changedFields = Object.keys(generalUpdates).filter((key) => {
      const newValue = (generalUpdates as Record<string, unknown>)[key];
      const oldValue = (hub as unknown as Record<string, unknown>)[key];
      return JSON.stringify(oldValue) !== JSON.stringify(newValue);
    });
    if (changedFields.length > 0) {
      Object.assign(hub, generalUpdates);
      logEntries.push({
        action: "hub_details_updated",
        details: `Updated: ${changedFields.join(", ")}`,
      });
    }

    // 2. Verification status dropdown
    if (verificationStatus && verificationStatus !== hub.verificationStatus) {
      const previousVerification = hub.verificationStatus;
      hub.verificationStatus = verificationStatus;
      logEntries.push({
        action: "verification_status_changed",
        details:
          `Hub verification status changed from "${previousVerification}" to "${verificationStatus}"` +
          (reason ? `. Reason: ${reason}` : ""),
      });
    }

    // 3. Operational status dropdown
    if (status && status !== hub.status) {
      const previousStatus = hub.status;
      hub.status = status;
      const detailParts = [
        `Hub status changed from "${previousStatus}" to "${status}"`,
      ];
      if (reason) detailParts.push(`Reason: ${reason}`);
      if (maintenanceStart && maintenanceEnd) {
        detailParts.push(
          `Maintenance period: ${maintenanceStart} - ${maintenanceEnd}`,
        );
      }
      logEntries.push({
        action: `hub_${status}`,
        details: detailParts.join(". "),
      });
    }

    if (logEntries.length === 0) {
      return sendTsRestSuccess(res, 200, {
        success: true,
        message: "No changes detected",
        data: hub,
      });
    }

    for (const entry of logEntries) {
      hub.activityLog.push({
        action: entry.action,
        performedBy: new mongoose.Types.ObjectId(adminUserId),
        details: entry.details,
        createdAt: new Date(),
      } as any);
    }

    await hub.save();

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: "Storage hub updated successfully",
      data: hub,
    });
  },
);

// Verification documents are added one at a time after hub creation (a
// single multer instance can't parse two different file-filter configs in
// one request, so this is deliberately separate from the hub-creation
// upload). Accepts 1+ files under one entry — e.g. several facility photos
// filed under a single "facility_photos" row.
export const uploadHubDocument = tryCatchWrapper(
  async (
    req: Request<HubIdParam, {}, UploadHubDocumentInput>,
    res: Response,
  ) => {
    const { id } = req.params;
    const { type, fileName } = req.body;
    const adminUserId = req.session.userId as string;
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      return sendTsRestError(res, 400, "At least one file is required");
    }

    const hub = await Hub.findById(id);
    if (!hub) {
      return sendTsRestError(res, 404, "Storage Hub not found");
    }

    const uploadResults = await Promise.all(
      files.map((file) => uploadDocumentToCloudinary(file.buffer)),
    );
    const totalBytes = uploadResults.reduce((sum, r) => sum + r.bytes, 0);
    const resolvedFileName = fileName || files[0].originalname;

    const fileUrls = uploadResults.map((r) => r.url);
    const existingDoc = hub.verificationDocuments.find(
      (d: (typeof hub.verificationDocuments)[number]) => d.type === type,
    );

    if (type === "facility_photos" && existingDoc) {
      // Photos accumulate rather than replace — a new batch adds to the
      // gallery instead of discarding what's already there.
      existingDoc.fileUrls.push(...fileUrls);
      existingDoc.fileName = resolvedFileName;
      existingDoc.fileSize += totalBytes;
      existingDoc.uploadedAt = new Date();
      existingDoc.status = "pending";
      existingDoc.verifiedAt = null;
      existingDoc.verifiedBy = null;
    } else if (existingDoc) {
      // Single-document types (business registration, lease, inspection
      // report) — a re-upload is a corrected version, so it replaces the
      // old one rather than piling up a second row of the same type.
      existingDoc.fileName = resolvedFileName;
      existingDoc.fileUrls = fileUrls;
      existingDoc.fileSize = totalBytes;
      existingDoc.uploadedAt = new Date();
      existingDoc.status = "pending";
      existingDoc.verifiedAt = null;
      existingDoc.verifiedBy = null;
    } else {
      hub.verificationDocuments.push({
        type,
        fileName: resolvedFileName,
        fileUrls,
        fileSize: totalBytes,
        uploadedAt: new Date(),
        status: "pending",
        verifiedAt: null,
        verifiedBy: null,
      } as any);
    }

    // Facility photos double as the hub's main gallery (Overview tab), so
    // this is the only place those ever need to be uploaded — no separate
    // "add images" endpoint required.
    if (type === "facility_photos") {
      hub.images.push(...fileUrls);
    }

    hub.activityLog.push({
      action: "document_uploaded",
      performedBy: new mongoose.Types.ObjectId(adminUserId),
      details:
        type === "facility_photos"
          ? `Uploaded ${fileUrls.length} new photo${fileUrls.length === 1 ? "" : "s"} to the facility gallery`
          : `Uploaded document: ${resolvedFileName}`,
      createdAt: new Date(),
    } as any);

    await hub.save();

    return sendTsRestSuccess(res, 201, {
      success: true,
      message: "Document uploaded successfully",
      data: { verificationDocuments: hub.verificationDocuments },
    });
  },
);

export const verifyHubDocument = tryCatchWrapper(
  async (req: Request<HubDocumentParam>, res: Response) => {
    const { id, docId } = req.params;
    const adminUserId = req.session.userId as string;

    const hub = await Hub.findById(id);
    if (!hub) {
      return sendTsRestError(res, 404, "Storage Hub not found");
    }

    const doc = hub.verificationDocuments.id(docId);
    if (!doc) {
      return sendTsRestError(res, 404, "Document not found on this hub");
    }

    if (doc.status === "verified") {
      return sendTsRestError(
        res,
        400,
        `This document ("${doc.fileName}") is already verified`,
      );
    }

    doc.status = "verified";
    doc.verifiedAt = new Date();
    doc.verifiedBy = new mongoose.Types.ObjectId(adminUserId);

    hub.activityLog.push({
      action: "document_verified",
      performedBy: new mongoose.Types.ObjectId(adminUserId),
      details: `Verified document: ${doc.fileName}`,
      createdAt: new Date(),
    } as any);

    await hub.save();

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: "Document verified successfully",
      data: { document: doc },
    });
  },
);

// Mirrors sendBookingEmailAdmin exactly, targeting the hub's own
// contact person instead of a booking's farmer.
export const sendHubContactEmail = tryCatchWrapper(
  async (
    req: Request<HubIdParam, {}, SendBookingEmailInput>,
    res: Response,
  ) => {
    const { id } = req.params;
    const { subject, message } = req.body;

    const hub = await Hub.findById(id).select(
      "name contactPersonName contactEmail",
    );
    if (!hub) {
      return sendTsRestError(res, 404, "Storage Hub not found");
    }

    if (!hub.contactEmail) {
      return sendTsRestError(
        res,
        400,
        "This storage hub has no contact email on file",
      );
    }

    const sent = await sendAdminCustomMessageEmail(
      hub.contactEmail,
      hub.contactPersonName || "AgroKeep Partner",
      `Storage Hub: ${hub.name}`,
      subject,
      message,
    );

    if (!sent) {
      return sendTsRestError(
        res,
        502,
        "Failed to send the email. Please try again shortly.",
      );
    }

    return sendTsRestSuccess(res, 200, {
      success: true,
      message: "Email sent successfully",
    });
  },
);
