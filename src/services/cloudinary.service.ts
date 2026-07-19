import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import multer from "multer";
import { env } from "../config/keys.js";

// 1. Initialize your existing Cloudinary SDK instance
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

// 2. Setup standard Multer memory storage (No conflicting packages needed!)
// This takes the file streaming in from the request and holds it temporarily in RAM
const storage = multer.memoryStorage();

export const uploadMemoryParser = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images are allowed for hub registration."));
    }
  },
});

// 3. Custom Stream Helper containing all your webp & responsive optimizations
export const uploadToCloudinary = (fileBuffer: Buffer): Promise<string> => {
  return new Promise((resolve, reject) => {
    // We use upload_stream since the file lives as a buffer in memory
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "agrokeep-hubs",
        resource_type: "image",
        quality: "auto",
        fetch_format: "webp", // Automatically converts files to webp to save bandwidth
        secure: true,
        // Your specific delivery optimization dimensions
        eager: [
          { width: 800, height: 600, crop: "limit" },
          { width: 400, height: 300, crop: "limit" },
        ],
        responsive_breakpoints: {
          create_derived: true,
          transformation: {
            quality: "auto:good",
            fetch_format: "auto",
          },
        },
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result)
          return reject(new Error("Cloudinary returned an empty response."));

        resolve(result.secure_url); // Resolves the clean HTTPS string URL
      },
    );

    // Write the file buffer to the stream and close it
    uploadStream.end(fileBuffer);
  });
};
