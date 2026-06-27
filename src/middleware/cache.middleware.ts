import NodeCache from "node-cache";
import { Request, Response, NextFunction } from "express";
import logger from "../config/logger.js";

//create cache
export const cache = new NodeCache({
  stdTTL: 3600, // cache data for 1hr
  checkperiod: 620, //check for expired keys every 620 secs
  useClones: true, //prevent cached data from being mutated by reference
});

//cache function to save data
export const cacheMiddleware =
  (key: string, ttl = 3600) =>
  (req: Request, res: Response, next: NextFunction) => {
    //create unique key based on our userId, api routes and query parameters
    const userId = req.session.userId || "anonymous";
    const cacheKey = `cache:${userId}:${key}:${req.originalUrl}`;
    try {
      const cachedData = cache.get(cacheKey);
      if (cachedData) {
        logger.info(`Cache hit: ${cacheKey}`);
        return res.json(cachedData);
      }

      const originalJSON = res.json;

      res.json = function (data) {
        //only cache successful responses
        if (res.statusCode >= 400) {
          logger.info(`Cache skip (status ${res.statusCode}): ${cacheKey}`);
          return originalJSON.call(this, data);
        }
        cache.set(cacheKey, data, ttl);
        logger.info(`Cache set: ${cacheKey}`);
        return originalJSON.call(this, data);
      };
      next();
    } catch (error) {
      logger.error({ error }, "Cache error");
      next(error);
    }
  };

export const clearCache =
  (pattern: string | null = null, clearAll = false) =>
  (req: Request, res: Response, next: NextFunction) => {
    //get the array of cached keys
    const keys = cache.keys();
    if (clearAll) {
      keys.forEach((key) => cache.del(key));
      logger.info("Cleared all cache entries");
      return next();
    }
    //require a pattern or userId to avoid accidentally wiping the entire cache
    if (!pattern && !req.session.userId) {
      logger.warn("clearCache called without pattern or userId — skipping");
      return next();
    }
    const userId = req.session.userId || "";
    const userPrefix = userId ? `cache:${userId}:` : "";
    //if we have a userId, only clear keys that match both pattern and userId
    const matchingKeys = pattern
      ? keys.filter((key) => {
          if (userId) {
            return key.includes(userPrefix) && key.includes(pattern);
          }
          //if no userId, just match the pattern
          return key.includes(pattern);
        })
      : keys.filter((key) => key.includes(userPrefix));
    matchingKeys.forEach((key) => cache.del(key));
    logger.info(
      `Cleared ${matchingKeys.length} cache entries for ${
        userId ? `user ${userId}` : "all users"
      }`,
    );
    next();
  };
