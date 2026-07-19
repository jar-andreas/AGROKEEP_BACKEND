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
  name: z.string({ message: "Hub name is required" }).trim(),
  state: z.string({ message: "State is required" }).trim(),
  lga: z.string({ message: "LGA is required" }).trim(),
  address: z.string({ message: "Address is required" }).trim(),
  proximityText: z.string({ message: "Proximity text is required" }).trim(),
  storageType: z.string({ message: "Storage type is required" }).trim(),
  operatingHours: z.string().trim().optional(),
  aboutFacility: z.string().trim().min(20, "Provide a descriptive summary"),
  
  // Straightforward number parsing
  totalCapacity: z.string().transform(Number),
  availableCapacity: z.string().transform(Number).optional(),
  unitType: z.string({ message: "Unit type is required" }).trim(),

  // Array Fields
  supportedCrops: jsonArrayCoercion,
  features: jsonArrayCoercion,
  whatsIncluded: jsonArrayCoercion,

  // Standard flat string handling for the remaining fields
  specStorageMethod: z.string({ message: "Storage method is required" }).trim(),
  specFacilitySize: z.string({ message: "Facility size is required" }).trim(),
  specClimateControl: z.string({ message: "Climate control description is required" }).trim(),
  specSecurity: z.string({ message: "Security description is required" }).trim(),
  specAccessibility: z.string({ message: "Accessibility details are required" }).trim(),
  specNearestMajorMarket: z.string({ message: "Nearest major market is required" }).trim(),

  pricePerBagPerWeek50kg: z.string().transform(Number),
  pricePerCratePerWeek50kg: z.string().transform(Number),
  priceWeeklyBulk100Plus: z.string().transform(Number),
  priceMonthly: z.string().transform(Number),
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
