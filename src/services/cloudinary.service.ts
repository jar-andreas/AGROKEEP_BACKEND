import { v2 as cloudinary } from "cloudinary";
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

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
}

// Upload Avatar Buffer Helper
export const uploadAvatarToCloudinary = (
  fileBuffer: Buffer,
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "agrokeep-avatars",
        resource_type: "image",
        quality: "auto",
        fetch_format: "webp",
        transformation: [
          { width: 400, height: 400, crop: "fill", gravity: "face" }, // Auto-crops & centers on user's face
        ],
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result)
          return reject(new Error("Cloudinary returned an empty response."));

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      },
    );

    uploadStream.end(fileBuffer);
  });
};

// Delete Helper
export const deleteFromCloudinary = (publicId: string): Promise<any> => {
  return cloudinary.uploader.destroy(publicId);
};

// Verification documents (CAC certificate, lease agreement, inspection
// report) are PDFs, not photos — uploadMemoryParser above hard-rejects
// anything that isn't an image, so this is a separate parser/uploader pair
// rather than loosening the existing image-only one used for hub/avatar
// photos.
// Business Registration / Proof of Ownership / Inspection Report are
// realistically PDFs or Word docs, so both are accepted alongside images
// (facility photos).
const ALLOWED_DOCUMENT_MIMETYPES = [
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
];

export const uploadDocumentParser = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB — PDFs/docs and multi-photo bundles run larger than a single avatar/hub image
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("image/") ||
      ALLOWED_DOCUMENT_MIMETYPES.includes(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only images, PDF, or Word documents are allowed for verification documents.",
        ),
      );
    }
  },
});

export interface DocumentUploadResult {
  url: string;
  publicId: string;
  bytes: number;
}

export const uploadDocumentToCloudinary = (
  fileBuffer: Buffer,
): Promise<DocumentUploadResult> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "agrokeep-hub-documents",
        // "auto" lets Cloudinary store a PDF as a raw file and an image as
        // an image, instead of forcing the image-specific pipeline
        // (webp/eager transforms) that uploadToCloudinary uses.
        resource_type: "auto",
        secure: true,
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result)
          return reject(new Error("Cloudinary returned an empty response."));

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes,
        });
      },
    );

    uploadStream.end(fileBuffer);
  });
};
