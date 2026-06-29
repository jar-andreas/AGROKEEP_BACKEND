import { z } from 'zod';

export const validateSignupSchema = z.object({
    fullName: z
    .string({ error: "Full name is required" })
    .trim()
    .min(2, { message: "Full name must be at least 2 characters long" })
    .max(100, { message: "Full name must be at most 100 characters long" }),

    email: z
    .string({ error: "Email is required" })
    .email({ message: "Invalid email address" })
    .toLowerCase()
    .trim(),

    phone: z
    .string({ error: "Phone number is required" })
    .min(10, { message: "Phone number must be at least 10 digits long" })
    .max(15, { message: "Phone number must be at most 15 digits long" })
    .regex(/^\+?[1-9]\d{1,14}$/, { message: "Invalid phone number" }),

    password: z
    .string({ error: "Password is required" })
    .min(6, { message: "Password must be at least 6 characters long" })
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),

    confirmPassword: z
    .string({ error: "Confirm password is required" })
    .min(6, { message: "Confirm password must be at least 6 characters long" }),

    role: z
    .enum(['admin', 'client'], { error: "Role must be either 'admin' or 'client'" })
    .default('client'),
})
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
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
    })
});