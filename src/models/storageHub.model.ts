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
  pricePerBagPerDay50kg: number;
  pricePerCratePerDay50kg: number;
  priceDailyBulk100Plus: number;
  priceWeeklyFlat: number;

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
    pricePerBagPerDay50kg: { type: Number, required: true, default: 0 },
    pricePerCratePerDay50kg: { type: Number, required: true, default: 0 },
    priceDailyBulk100Plus: { type: Number, required: true, default: 0 },
    priceWeeklyFlat: { type: Number, required: true, default: 0 },

    // Admin Fields Added & Defined
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: true },

    slug: { type: String, unique: true },
  },
  { timestamps: true },
);

// AUTOMATIC SLUG HOOK

StorageHubSchema.pre("save", async function () {
  // Only generate or update slug if the name is modified
  if (!this.isModified("name")) return;

  // 1. Generate base string
  let generatedSlug = this.name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // 2. Loop until a truly unique slug variant is confirmed
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
