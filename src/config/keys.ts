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
  { key: "SESSION_SECRET", required: true },
  { key: "LOG_LEVEL", required: true },
  { key: "BREVO_API_KEY", required: true },
  { key: "EMAIL_OWNER", required: true },
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
