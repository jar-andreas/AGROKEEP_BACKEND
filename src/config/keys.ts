import { config } from "dotenv";

// Always attempt to load .env in development/local environments
if (process.env.NODE_ENV !== "production") {
  config();
}

interface EnvSpec {
  key: string;
  required?: boolean;
}

const ENV_VARS: EnvSpec[] = [
  { key: "NODE_ENV", required: true },
  { key: "DATABASE_URL", required: true },
  { key: "DATABASE_NAME", required: true },
  { key: "SERVER_URL", required: true },
  { key: "CLIENT_URL", required: true },
  { key: "FRONTEND_URL", required: true },
  { key: "GOOGLE_CLIENT_SECRET", required: true },
  { key: "GOOGLE_CLIENT_ID", required: true },
  { key: "GOOGLE_CALLBACK_URL", required: true },
  { key: "SESSION_SECRET", required: true },
  { key: "LOG_LEVEL", required: true },
  { key: "BREVO_API_KEY", required: true },
  { key: "EMAIL_OWNER", required: true },
  { key: "CLOUDINARY_CLOUD_NAME", required: true },
  { key: "CLOUDINARY_API_KEY", required: true },
  { key: "CLOUDINARY_API_SECRET", required: true },
  { key: "PAYSTACK_SECRET_KEY", required: true },
];

interface Env {
  readonly [key: string]: string;
}

// Find all missing keys (either undefined or empty strings)
const missingVars = ENV_VARS.filter(
  (v) => v.required && (!process.env[v.key] || process.env[v.key]?.trim() === "")
);

if (missingVars.length > 0) {
  const missingKeys = missingVars.map((v) => v.key).join(", ");
  throw new Error(`Missing required environment variables: ${missingKeys}`);
}

const env: Env = process.env as Env;

export { env };
