import mongoose, { Schema, Document } from "mongoose";

export const HUB_VERIFICATION_STATUSES = [
  "verified",
  "pending",
  "needs_update",
] as const;

export const HUB_STATUSES = [
  "active",
  "suspended",
  "deactivated",
  "inactive",
] as const;

export const HUB_DOCUMENT_TYPES = [
  "business_registration",
  "proof_of_ownership",
  "facility_photos",
  "inspection_report",
  "other",
] as const;

export interface IHubDocument {
  type: (typeof HUB_DOCUMENT_TYPES)[number];
  fileName: string;
  // Array even for single-file documents, so "facility_photos" (several
  // images filed under one row in the Verification Documents tab) fits the
  // same shape as a one-page PDF.
  fileUrls: string[];
  fileSize: number; // bytes
  uploadedAt: Date;
  status: "verified" | "pending" | "rejected";
  verifiedAt: Date | null;
  verifiedBy: mongoose.Types.ObjectId | null;
}

export interface IHubActivityLogEntry {
  action: string;
  performedBy: mongoose.Types.ObjectId;
  details: string;
  createdAt: Date;
}

export interface IHub extends Document {
  name: string;
  state: string;
  lga: string;
  address: string;
  // For the frontend's map pin (Location & Contact tab). Every hub is
  // expected to have a precise location.
  latitude: number;
  longitude: number;
  proximityText: string;
  storageType: string;
  operatingHours: string;
  aboutFacility: string;
  totalCapacity: number;
  availableCapacity: number;
  unitType: string;
  images: string[];
  supportedCrops: string[];
  features: string[];
  whatsIncluded: string[];

  // Flattened Facility Specifications
  specStorageMethod: string;
  specFacilitySize: string;
  specClimateControl: string;
  specSecurity: string;
  specAccessibility: string;
  specNearestMajorMarket: string;

  // Flattened Pricing Details
  pricePerBagPerDay: number;
  pricePerCratePerDay: number;
  priceBulk100Units: number; // Auto-calculated (5% discount per unit per day)
  priceWeeklyFlat: number; // Auto-calculated (7 * base daily rate per unit)

  // Administrative Fields
  rating: number;
  reviewCount: number;
  verificationStatus: (typeof HUB_VERIFICATION_STATUSES)[number];
  status: (typeof HUB_STATUSES)[number];

  // Owner / contact info — free text, mirroring how Booking stores farmer
  // contact details rather than requiring a linked User account.
  hubOwnerName: string;
  contactPersonName: string;
  contactPhoneNumber: string;
  contactEmail: string;

  verificationDocuments: IHubDocument[];
  activityLog: IHubActivityLogEntry[];

  slug: string;
}

// MAIN HUB SCHEMA
const StorageHubSchema = new Schema<IHub>(
  {
    name: { type: String, required: true, trim: true },
    state: { type: String, required: true },
    lga: { type: String, required: true },
    address: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    proximityText: { type: String, required: true },
    storageType: { type: String, required: true },
    operatingHours: { type: String, default: "Mon - Sat . 7am - 6pm" },
    aboutFacility: { type: String, required: true },
    totalCapacity: { type: Number, required: true },
    availableCapacity: { type: Number, required: true },
    unitType: { type: String, required: true },
    images: [{ type: String, required: true }],
    supportedCrops: [{ type: String, required: true }],
    features: [{ type: String }],
    whatsIncluded: [{ type: String }],

    // Flattened Specs
    specStorageMethod: { type: String, required: true },
    specFacilitySize: { type: String, required: true },
    specClimateControl: { type: String, required: true },
    specSecurity: { type: String, required: true },
    specAccessibility: { type: String, required: true },
    specNearestMajorMarket: { type: String, required: true },

    // Flattened Pricing
    pricePerBagPerDay: { type: Number, required: true, default: 0 },
    pricePerCratePerDay: { type: Number, required: true, default: 0 },
    priceBulk100Units: { type: Number, default: 0 },
    priceWeeklyFlat: { type: Number, default: 0 },

    // Admin Fields
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    verificationStatus: {
      type: String,
      enum: HUB_VERIFICATION_STATUSES,
      default: "verified",
    },
    status: {
      type: String,
      enum: HUB_STATUSES,
      default: "active",
    },

    hubOwnerName: { type: String, required: true },
    contactPersonName: { type: String, required: true },
    contactPhoneNumber: { type: String, required: true },
    contactEmail: { type: String, required: true },

    verificationDocuments: [
      {
        type: {
          type: String,
          enum: HUB_DOCUMENT_TYPES,
          required: true,
        },
        fileName: { type: String, required: true },
        fileUrls: [{ type: String, required: true }],
        fileSize: { type: Number, required: true },
        uploadedAt: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: ["verified", "pending", "rejected"],
          default: "pending",
        },
        verifiedAt: { type: Date, default: null },
        verifiedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
      },
    ],

    activityLog: [
      {
        action: { type: String, required: true },
        performedBy: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        details: { type: String, default: "" },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    slug: { type: String, unique: true },
  },
  { timestamps: true },
);

// COMBINED AUTOMATIC PRE-SAVE HOOK (SLUG & PRICING CALCULATIONS)
StorageHubSchema.pre("save", async function () {
  // --- 1. AUTOMATIC PRICING CALCULATIONS ---
  const baseRate = this.pricePerBagPerDay || this.pricePerCratePerDay || 0;

  // 100+ Units Bulk Rate (5% discount per unit daily rate)
  this.priceBulk100Units = parseFloat((baseRate * 0.95).toFixed(2));

  // Weekly Flat Rate (7 * base daily rate per unit)
  this.priceWeeklyFlat = baseRate * 7;

  // --- 2. AUTOMATIC UNIQUE SLUG GENERATION ---
  if (!this.isModified("name")) return;

  let generatedSlug = this.name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const HubModel = this.constructor as mongoose.Model<IHub>;
  let slugExists = await HubModel.findOne({ slug: generatedSlug });
  let counter = 1;

  while (slugExists) {
    const fallbackSlug = `${generatedSlug}-${counter}`;
    slugExists = await HubModel.findOne({ slug: fallbackSlug });
    if (!slugExists) {
      generatedSlug = fallbackSlug;
      break;
    }
    counter++;
  }

  this.slug = generatedSlug;
});

const Hub =
  mongoose.models.Hub || mongoose.model<IHub>("Hub", StorageHubSchema);

export default Hub;
