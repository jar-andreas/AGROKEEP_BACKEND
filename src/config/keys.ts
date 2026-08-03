import { config } from "dotenv";

//load env files
if (process.env.NODE_ENV !== "production") {
  config();
}

interface Envspec {
  key: string;
  required?: boolean;
}

const ENV_VARS: Envspec[] = [
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

const env: Env = process.env as Env;

const requiredVars = ENV_VARS.filter((v) => v.required);
const missingVars = requiredVars.filter((v) => !env[v.key]);

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environmental variables: ${missingVars.map((v) => v.key).join(", ")}`,
  );
}

export { env };
