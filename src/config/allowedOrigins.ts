import { env } from "./keys.js";

// Single source of truth for every frontend origin this backend trusts —
// used both by the CORS check (index.ts) and by anything that needs to
// safely reflect the caller's origin back into a URL, like Paystack's
// callback_url (paystack.service.ts). Never add a new trusted origin in only
// one of those two places — an origin that's CORS-allowed but missing here
// (or vice versa) is exactly the kind of drift that caused the "callback
// keeps going to production" bug.
const cleanOrigin = env.CLIENT_URL ? env.CLIENT_URL.replace(/\/$/, "") : "";

export const allowedOrigins = [
  "http://localhost:4600",
  "http://localhost:5000",
  cleanOrigin,
].filter(Boolean);

if (env.NODE_ENV === "production" && env.CLIENT_URL) {
  if (!allowedOrigins.includes(env.CLIENT_URL)) {
    allowedOrigins.push(env.CLIENT_URL);
  }
}
