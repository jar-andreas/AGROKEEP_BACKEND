import { rateLimit, ipKeyGenerator } from "express-rate-limit";

//Generate API Rate Limiter
export const globalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 100, //Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later",
  keyGenerator: (req) => {
    return `${ipKeyGenerator(req.ip as string)}-${req.headers["user-agent"] || "unknown-user-agent"}`;
  },
});

export const customRateLimiter = (
  maxRequests: number,
  windowMinutes: number = 3,
) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: maxRequests,
    message: "Too many requests, please try again later",
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return `${ipKeyGenerator(req.ip as string)}-${
        req.headers["user-agent"] || "unknown-user-agent"
      }`;
    },
  });
