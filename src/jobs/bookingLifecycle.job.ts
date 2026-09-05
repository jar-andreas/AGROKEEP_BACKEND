import cron from "node-cron";
import logger from "../config/logger.js";
import { advanceBookingLifecycle } from "../services/bookingLifecycle.service.js";

// Runs hourly. Drop-off/pick-up dates are day-granularity, but an hourly
// sweep means a booking isn't left sitting in the wrong status for up to
// 23 extra hours after its date arrives.
const SCHEDULE = "0 * * * *";

export const startBookingLifecycleJob = (): void => {
  cron.schedule(SCHEDULE, async () => {
    try {
      const result = await advanceBookingLifecycle();
      if (result.expiredPending || result.movedToInStorage || result.completed) {
        logger.info(
          { ...result },
          "Booking lifecycle sweep advanced booking statuses",
        );
      }
    } catch (error) {
      logger.error({ error }, "Booking lifecycle sweep failed");
    }
  });

  logger.info(`Booking lifecycle job scheduled ("${SCHEDULE}")`);
};
