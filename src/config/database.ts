import mongoose, { ConnectOptions } from "mongoose";
import { env } from "./keys.js";
import logger, { logError } from "./logger.js";

//database connect state
interface DBConnection {
  isConnected: boolean;
  retryCount: number;
  maxRetries: number;
}

const dbConnection: DBConnection = {
  isConnected: false,
  retryCount: 0,
  maxRetries: 5,
};

const connectOptions: ConnectOptions = {
  dbName: env.DATABASE_NAME,
  serverSelectionTimeoutMS: 45000,
  socketTimeoutMS: 5000,
  retryWrites: true,
  retryReads: true,
  maxPoolSize: 50,
  minPoolSize: 1,
  monitorCommands: env.NODE_ENV === "development",
};

export const connectDB = async (): Promise<void> => {
  if (dbConnection.isConnected) {
    logger.info("Uisng existing MongoDb Connection");
    return;
  }
  if (dbConnection.retryCount >= dbConnection.maxRetries) {
    logger.error("Max MongoDb connection retries reached");
    process.exit(1);
  }

  //proceed to establish database call
  try {
    const conn = await mongoose.connect(env.DATABASE_URL!, connectOptions);
    dbConnection.isConnected = conn.connections[0].readyState === 1;
    dbConnection.retryCount = 0; //reet retry count on successful connection

    if (dbConnection.isConnected) {
      logger.info(`MongoDb Connected: ${conn.connection.host}`);

      //handle connection event handlers
      mongoose.connection.on("error", (err) => {
        logger.error("MongoDb connection error", err);
        dbConnection.isConnected = false;
      });
      mongoose.connection.on("disconnected", () => {
        logger.info("MongoDb Disconnected");
        dbConnection.isConnected = false;
        //Attempt to reconnect
        if (dbConnection.retryCount < dbConnection.maxRetries) {
          dbConnection.retryCount++;
          logger.info(
            `Attempting to reconnect (${dbConnection.retryCount}/${dbConnection.maxRetries})...`,
          );
          setTimeout(connectDB, 5000);
        }
      });
    }
  } catch (error: unknown) {
    dbConnection.retryCount++;
    const errorMessage =
      error instanceof Error ? error?.message : "Unknown error";
    logError(
      `MongoDb connection failed (attempt ${dbConnection.retryCount}/ ${dbConnection.maxRetries}): ${errorMessage}`,
    );
    if (dbConnection.retryCount < dbConnection.maxRetries) {
      logger.info("Retrying in 5 seconds...");
      setTimeout(connectDB, 5000);
    } else {
      logger.error("Max retries reached. Exiting...");
      process.exit(1);
    }
  }
};

//Handle Graceful Shutdown
export const gracefulShutdown = async (): Promise<void> => {
  try {
    logger.info("\n🛑 Received shutdown signal. Closing server...");

    //Close MongoDb Connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      logger.info("✅ MongoDB connection closed");
    }

    logger.info("✅ Server shutdown complete");
    process.exit(0);
  } catch (error) {
    logError(error, "❌ Error during shutdown:");
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  logger.error(
    { err: { name: error.name, message: error.message } },
    "❌ UNCAUGHT EXCEPTION! Shutting down...",
  );
  // Attempt to close server gracefully
  gracefulShutdown().finally(() => process.exit(1));
});
