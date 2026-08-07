import { z } from "zod";

export const validateSignupSchema = z
  .object({
    fullName: z
      .string({ error: "Full name is required" })
      .trim()
      .min(5, { message: "Full name must be at least 5 characters long" })
      .max(50, { message: "Full name must be at most 50 characters long" }),

    email: z
      .string({ error: "Email is required" })
      .email({ message: "Invalid email address" })
      .toLowerCase()
      .trim(),

    phone: z
      .string()
      .refine(
        (num) => num === "" || /^\+\d{10,15}$/.test(num),
        "Invalid phone number",
      ),

    password: z
      .string()
      .min(8, {
        message: "Password must be at least 8 characters long",
      })
      .regex(/[A-Z]/, {
        message: "Password must contain at least one upper case letter",
      })
      .regex(/[a-z]/, {
        message: "Password must contain at least one lower case letter",
      })
      .regex(/[!@#$%^&*(),.?":{}|<>]/, {
        message: "Password must contain at least one special character",
      }),

    confirmPassword: z
      .string()
      .min(8, {
        message: "Password must be at least 8 characters long",
      })
      .regex(/[A-Z]/, {
        message: "Password must contain at least one uppercase letter",
      })
      .regex(/[a-z]/, {
        message: "Password must contain at least one lowercase letter",
      })
      .regex(/[!@#$%^&*(),.?":{}|<>]/, {
        message: "Password must contain at least one special character",
      }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const ValidateLoginSchema = z.object({
  email: z
    .string({ error: "Email is required" })
    .email({ message: "Invalid email address" })
    .toLowerCase()
    .trim(),

  password: z
    .string()
    .min(8, {
      message: "Password must be at least 8 characters long",
    })
    .regex(/[A-Z]/, {
      message: "Password must contain at least one upper case letter",
    })
    .regex(/[a-z]/, {
      message: "Password must contain at least one lower case letter",
    })
    .regex(/[!@#$%^&*(),.?":{}|<>]/, {
      message: "Password must contain at least one special character",
    }),
});

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email format"),
});

export const resendOtpSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email format"),
});

export const verifyForgotPasswordOtpSchema = z.object({
  body: z.object({
    otp: z
      .string({ message: "OTP code is required." })
      // 💡 Ensures they don't send whitespace or letters if it's a numeric code
      .regex(/^\d+$/, "OTP must contain only numbers.")
      // Matches the exact length of your token generator (e.g., 4, 5, or 6 digits)
      .min(6, "OTP cannot be less than 6 digits."),
  }),
});

export const validateContactUsSchema = z.object({
  fullName: z
    .string()
    .trim()
    .regex(/^[a-zA-Z\s]{5,50}$/, {
      message:
        "Full name must be 5-50 characters and contain only letters and spaces",
    }),

  // RFC 5322 standard-ish regex for email
  email: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, {
      message: "Please enter a valid email address (e.g., name@domain.com)",
    }),

  // Strictly enforces E.164 international format (e.g., +2348012345678)
  // or local format (08012345678)
  phone: z
    .string()
    .trim()
    .regex(/^(\+?\d{1,4}?[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4,6}$/, {
      message: "Please enter a valid phone number (10-15 digits)",
    }),

  // Allows alphanumeric + common punctuation, strict length
  message: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9\s.,!?'"()-]{10,1000}$/, {
      message:
        "Message must be 10-1000 characters (alphanumeric and standard punctuation only)",
    }),
});

export const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, {
        message: "Password must be at least 8 characters long",
      })
      .regex(/[A-Z]/, {
        message: "Password must contain at least one uppercase letter",
      })
      .regex(/[a-z]/, {
        message: "Password must contain at least one lowercase letter",
      })
      .regex(/[!@#$%^&*(),.?":{}|<>]/, {
        message: "Password must contain at least one special character",
      }),
    confirmPassword: z
      .string()
      .min(8, {
        message: "Password must be at least 8 characters long",
      })
      .regex(/[A-Z]/, {
        message: "Password must contain at least one uppercase letter",
      })
      .regex(/[a-z]/, {
        message: "Password must contain at least one lowercase letter",
      })
      .regex(/[!@#$%^&*(),.?":{}|<>]/, {
        message: "Password must contain at least one special character",
      }),
  })

  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"], // Targets the error feedback explicitly to the confirmPassword field
  });

//Storage Hub Validations

const jsonArrayCoercion = z.preprocess((val) => {
  if (!val) return [];
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [val]; // Fallback if it's just a regular flat string
    }
  }
  if (Array.isArray(val)) return val;
  return [val];
}, z.array(z.string().trim()));

export const createHubValidationSchema = z.object({
  // 🔒 String constraints: min lengths to stop 1-letter entries like "A"
  name: z
    .string({ message: "Hub name is required" })
    .trim()
    .min(3, "Hub name must be at least 3 characters long"),

  state: z
    .string({ message: "State is required" })
    .trim()
    .min(2, "State name must be at least 2 characters"),

  lga: z
    .string({ message: "LGA is required" })
    .trim()
    .min(2, "LGA must be at least 2 characters"),

  address: z
    .string({ message: "Address is required" })
    .trim()
    .min(5, "Please provide a more detailed address (at least 5 characters)"),

  proximityText: z
    .string({ message: "Proximity text is required" })
    .trim()
    .min(3, "Proximity text must be at least 3 characters"),

  storageType: z.string({ message: "Storage type is required" }).trim(),

  operatingHours: z.string().trim().optional(),

  aboutFacility: z
    .string({ message: "Facility description is required" })
    .trim()
    .min(20, "Facility description must be at least 20 characters long"),

  // 🔒 Strict Capacity checks: Must be positive numbers (> 0)
  totalCapacity: z.coerce
    .number({ message: "Total capacity must be a valid number" })
    .positive("Total capacity must be greater than 0"),

  availableCapacity: z.coerce
    .number({ message: "Available capacity must be a valid number" })
    .nonnegative("Available capacity cannot be negative")
    .optional(),

  unitType: z.string({ message: "Unit type is required" }).trim(),

  rating: z.coerce.number().min(0).max(5).optional(),
  reviewCount: z.coerce.number().nonnegative().optional(),

  // Array Fields
  supportedCrops: jsonArrayCoercion,
  features: jsonArrayCoercion,
  whatsIncluded: jsonArrayCoercion,

  // Spec Fields (with minimum character checks)
  specStorageMethod: z
    .string({ message: "Storage method is required" })
    .trim()
    .min(3, "Storage method details too short"),

  specFacilitySize: z
    .string({ message: "Facility size is required" })
    .trim()
    .min(2, "Facility size details too short"),

  specClimateControl: z
    .string({ message: "Climate control description is required" })
    .trim()
    .min(3, "Climate control details too short"),

  specSecurity: z
    .string({ message: "Security description is required" })
    .trim()
    .min(3, "Security details too short"),

  specAccessibility: z
    .string({ message: "Accessibility details are required" })
    .trim()
    .min(3, "Accessibility details too short"),

  specNearestMajorMarket: z
    .string({ message: "Nearest major market is required" })
    .trim()
    .min(3, "Market name too short"),

  // 🔒 Pricing checks: Cannot be negative
  pricePerBagPerDay: z.coerce
    .number({ message: "Price must be a number" })
    .nonnegative("Price cannot be negative"),

  pricePerCratePerDay: z.coerce
    .number({ message: "Price must be a number" })
    .nonnegative("Price cannot be negative"),
});

export const createBookingSchema = z
  .object({
    hubId: z.string().min(1, "Storage Hub ID is required"),
    selectedCrop: z.string().min(1, "Please select a crop to proceed"),
    quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
    unitType: z.enum(["bags", "crates"]).default("bags"),

    // 🗓️ Drop-off Date Validation
    dropOffDate: z
      .string()
      .refine(
        (dateString) => {
          const selectedDate = new Date(dateString);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return !isNaN(selectedDate.getTime()) && selectedDate >= today;
        },
        { message: "Drop-off date must be a valid present or future date" },
      )
      .refine(
        (dateString) => {
          const date = new Date(dateString);
          // getUTCDay(): 0 = Sunday
          return date.getUTCDay() !== 0;
        },
        {
          message:
            "Facilities are closed on Sundays. Please pick a Monday - Saturday drop-off date.",
        },
      ),

    // 🗓️ Pick-up Date Validation (Replaces durationInDays)
    pickUpDate: z
      .string()
      .refine(
        (dateString) => {
          const selectedDate = new Date(dateString);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return !isNaN(selectedDate.getTime()) && selectedDate >= today;
        },
        { message: "Pick-up date must be a valid present or future date" },
      )
      .refine(
        (dateString) => {
          const date = new Date(dateString);
          return date.getUTCDay() !== 0;
        },
        {
          message:
            "Facilities are closed on Sundays. Please pick a Monday - Saturday pick-up date.",
        },
      ),

    fullName: z.string().min(1, "Full name is required").trim(),
    phoneNumber: z
      .string()
      .min(1, "Phone number is required")
      .regex(
        /^(\+?234|0)[789][01]\d{8}$/,
        "Please enter a valid phone number (e.g., +234... or 080...)",
      ),
    email: z
      .string()
      .email("Please enter a valid email address")
      .optional()
      .or(z.literal("")),
    specialInstructions: z.string().optional(),
  })
  // 🔗 Cross-field Validation: Ensure Pick-up is AFTER Drop-off
  .refine(
    (data) => {
      const dropOff = new Date(data.dropOffDate);
      const pickUp = new Date(data.pickUpDate);
      return pickUp > dropOff;
    },
    {
      message: "Pick-up date must be at least 1 day after the drop-off date",
      path: ["pickUpDate"], // Attaches error directly to pickUpDate in frontend forms
    },
  );

export const initializePaymentSchema = z.object({
  bookingId: z.string().min(1, "Booking ID is required"),
  hubId: z.string().optional(),
  slug: z.string().min(1, "Slug is required for payment callback routing"),
});

export const verifyPaymentSchema = z.object({
  reference: z.string().min(1, "Reference query paramter is required"),
});

export const updateHubValidationSchema = createHubValidationSchema.partial();

// Profile update validation
export const updateUserProfileSchema = z.object({
  fullName: z
    .string()
    .min(5, "Fullname must be at least 5 characters")
    .max(50, "Fullname must be at most 50 characters")
    .optional(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format")
    .optional(),
  notificationPreferences: z
    .object({
      bookingUpdates: z.boolean().optional(),
      paymentNotifications: z.boolean().optional(),
      reminderAlerts: z.boolean().optional(),
      smsNotifications: z.boolean().optional(),
      emailNotifications: z.boolean().optional(),
    })
    .optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm password is required"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"], // Attaches the error to confirmPassword field
  });

export type SignupInput = z.infer<typeof validateSignupSchema>;
export type LoginInput = z.infer<typeof ValidateLoginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type VerifyForgotPasswordOtpInput = z.infer<
  typeof verifyForgotPasswordOtpSchema
>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type validateContactUsSchema = z.infer<typeof validateContactUsSchema>;

export type CreateHubInput = z.infer<typeof createHubValidationSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
