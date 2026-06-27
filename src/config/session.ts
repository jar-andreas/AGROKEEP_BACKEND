import session from "express-session";
import MongoStore from "connect-mongo";
import { env } from "./keys.js";

//session max age in milliseconds (default: 24 hours)

const SESSION_MAX_AGE = env.SESSION_MAX_AGE
  ? parseInt(env.SESSION_MAX_AGE, 10)
  : 24 * 60 * 60 * 1000; // 24 HOURS

//Create MongoDb Session Store
const createSessionStore = () => {
  return MongoStore.create({
    mongoUrl: env.DATABASE_URL,
    dbName: env.DATABASE_NAME,
    collectionName: "sessions",
    touchAfter: 24 * 3600, // Lazy session update - only update once per day unless data changes
    autoRemove: "native", // Use MongoDB TTL for session cleanup
    stringify: false, // Store as objects instead of strings for better performance
  });
};

//Session middleware configuration
export const createSessionMiddleware = () => {
  const isProd = env.NODE_ENV === "production";
  return session({
    secret: env.SESSION_SECRET,
    name: "sessionId", //Custom Cookie name to avoid default "connect.sid"
    resave: false, //dont save sesion if modified
    saveUninitialized: false, //Dont create session until something stored
    store: createSessionStore(),
    cookie: {
      maxAge: SESSION_MAX_AGE,
      httpOnly: true, //Prevents XXS attacks
      secure: isProd, //HTTPS only in production
      sameSite: isProd ? "none" : "lax", //CSFR Protection
    },
    rolling: true, //Refresh expiration on every response
  });
};

export default createSessionMiddleware;
