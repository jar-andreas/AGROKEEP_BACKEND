import { env } from "./src/config/keys.js";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import { connectDB, gracefulShutdown } from "./src/config/database.js";
import logger, { logError } from "./src/config/logger.js";
import { createSessionMiddleware } from "./src/config/session.js";
import { globalLimiter } from "./src/middleware/ratelimit.middleware.js";
import {
  appErrorHandler,
  createExpressLogger,
  notFoundRoutes,
  setupGlobalErrorHandlers,
} from "./src/middleware/error.middleware.js";

import userRoutes from "./src/routes/user.routes.js";
import authRoutes from "./src/routes/googleAuth.route.js";
declare global {
  namespace Express {
    interface Request {
      requestTime?: string;
      rawBody?: Buffer;
    }
  }
}

//Extend express-session SessionData Interface
declare module "express-session" {
  interface SessionData {
    userId?: string;
    role?: "client" | "admin";
    resetEmail?: string; //set after OTP is verified, cleared after password reset or after 15 minutes (same as OTP expiry time)
  }
}

const app = express();
//Trust first proxy (for production)
app.set("trust proxy", 1);

//global error handler - node js process
setupGlobalErrorHandlers();

// Normalize and strip trailing slashes securely
const cleanOrigin = env.CLIENT_URL ? env.CLIENT_URL.replace(/\/$/, "") : "";

//CORS CONFIGURATION
const allowedOrigins = [cleanOrigin];
if (env.NODE_ENV === "production" && env.CLIENT_URL) {
  if (!allowedOrigins.includes(env.CLIENT_URL)) {
    allowedOrigins.push(env.CLIENT_URL);
  }
}

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  optionsSuccessStatus: 200,
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "ngrok-skip-browser-warning",
    "Access-Control-Allow-Origin",
    "Access-Control-Allow-Credentials",
  ],
  exposedHeaders: [
    "Content-Range",
    "X-Content-Range",
    "x-refresh-token",
    "set-cookie",
  ],
};

//rate limit
app.use(globalLimiter);
//Pino HTTP middleware for request logging
app.use(createExpressLogger());
app.use(cors(corsOptions));

// // Session middleware (after CORS, before body parsers)
app.use(createSessionMiddleware());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.disable("x-powered-by");

if (env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}
// Request time middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  req.requestTime = new Date().toISOString();
  next();
});

// Health check route
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    message: "Server is running",
    environment: env.NODE_ENV,
    timestamp: req.requestTime,
    uptime: process.uptime(),
  });
});

//api routes will be here
app.get("/session", (req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    message: "Session test",
    session: req.session,
  });
});

app.use("/api/v1/user", userRoutes);
app.use("/api/v1/google-auth", authRoutes);

// Handle 404
app.use(notFoundRoutes);
// Global error handler (adapted for ts-rest)
app.use(appErrorHandler);

//Server Configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3700;

const startServer = async (): Promise<void> => {
  let server: any;
  try {
    await connectDB();
    server = app.listen(PORT, "0.0.0.0", () => {
      logger.info(
        `\n✅ Server running in ${env.NODE_ENV} mode on port ${PORT}`,
      );
      logger.info(`🌐 http://localhost:${PORT}\n`);
    });

    //Handle Unhandles Promise Rejections
    process.on("unhandledRejection", (reason: unknown) => {
      console.error("\n❌ UNHANDLED REJECTION! Shutting down...");

      const error =
        reason instanceof Error
          ? `${reason.name}: ${reason.message}`
          : String(reason);

      logger.error({ reason: error }, "Unhandled rejection");

      //close server gracefully
      server.close(() => {
        logger.info("💥 Process terminated due to unhandled rejection");
        logger.info("✅ Server shutdown complete");
        process.exit(0);
      });
    });

    // Handle termination signals
    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);

    //Handle any other errors
    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.syscall !== "listen") throw error;

      switch (error.code) {
        case "EACCES":
          logger.error(`Port ${PORT} requires elevated privileges`);
          process.exit(1);
        case "EADDRINUSE":
          logger.error(`Port ${PORT} is already in use`);
          process.exit(1);
        default:
          throw error;
      }
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logError(`\n❌ Failed to start server: ${errorMessage}`);
    process.exit(1);
  }
};

startServer();
