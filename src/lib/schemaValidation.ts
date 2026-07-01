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
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
});

export const resendOtpSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
});

export const resetPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long'),
  confirmPassword: z.string().min(8, 'Password must be at least 8 characters long'),
});

export type SignupInput = z.infer<typeof validateSignupSchema>;
export type LoginInput = z.infer<typeof ValidateLoginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;


