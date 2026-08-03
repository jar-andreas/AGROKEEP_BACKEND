import mongoose, { Schema, Document } from "mongoose";

export interface IFarmersReview extends Document {
  hub: Schema.Types.ObjectId;
  user: Schema.Types.ObjectId;
  comment: string;
  cleanlinessRating: number;
  securityRating: number;
  accuracyRating: number;
  communicationRating: number;
  valueRating: number;
  overallRating: number; // Added for easy sorting/filtering
}

const reviewSchema = new Schema<IFarmersReview>(
  {
    hub: { type: Schema.Types.ObjectId, ref: "Hub", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    comment: { type: String, required: true, trim: true },
    cleanlinessRating: { type: Number, required: true, min: 1, max: 5 },
    securityRating: { type: Number, required: true, min: 1, max: 5 },
    accuracyRating: { type: Number, required: true, min: 1, max: 5 },
    communicationRating: { type: Number, required: true, min: 1, max: 5 },
    valueRating: { type: Number, required: true, min: 1, max: 5 },
    overallRating: { type: Number, default: 0, min: 1, max: 5 },
  },
  { timestamps: true },
);

// Index for fast lookups per hub ordered by recent
reviewSchema.index({ hub: 1, createdAt: -1 });

// Calculate overall average automatically before save
reviewSchema.pre("save", async function () {
  const sum =
    this.cleanlinessRating +
    this.securityRating +
    this.accuracyRating +
    this.communicationRating +
    this.valueRating;

  this.overallRating = parseFloat((sum / 5).toFixed(1));
});

const Review =
  mongoose.models.Review ||
  mongoose.model<IFarmersReview>("Review", reviewSchema);

export default Review;
