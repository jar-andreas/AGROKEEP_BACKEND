import mongoose, { Schema, Document } from "mongoose";

export interface IHub extends Document {
  name: string;
  state: string;
  lga: string;
  address: string;
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
  priceWeeklyFlat: number;   // Auto-calculated (7 * base daily rate per unit)

  // Administrative Fields
  rating: number;
  reviewCount: number;
  isVerified: boolean;

  slug: string;
}

// MAIN HUB SCHEMA
const StorageHubSchema = new Schema<IHub>(
  {
    name: { type: String, required: true, trim: true },
    state: { type: String, required: true },
    lga: { type: String, required: true },
    address: { type: String, required: true },
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
    isVerified: { type: Boolean, default: true },

    slug: { type: String, unique: true },
  },
  { timestamps: true }
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