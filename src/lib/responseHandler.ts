import type { Response } from "express";
import logger from "../config/logger.js";

//send response directly to express
const sendTsRestResponse = <T extends number>(
  res: Response,
  status: T,
  body: any,
): void => {
  res.status(status).json(body);
};

// Send success response directly
const sendTsRestSuccess = <T extends number>(
  res: Response,
  status: T,
  data: any,
): void => {
  sendTsRestResponse(res, status, data);
};

// Send error response directly
const sendTsRestError = <T extends number>(
  res: Response,
  status: T,
  error: string,
  details?: any,
): void => {
  logger.error({ error }, "Error response with message");
  sendTsRestResponse(res, status, {
    success: false,
    message: error,
    ...(details && { details }),
  });
};

export { sendTsRestResponse, sendTsRestSuccess, sendTsRestError };

