import { ZodError, z } from "zod";
import { NextFunction, Request, Response } from "express";
import { logError } from "../config/logger.js";

export const validateFormData =
  (schema: z.ZodSchema) =>
  (req: Request<any, any, any, any>, res: Response, next: NextFunction) => {
    try {
      const parsedData = schema.parse(req.body);
      req.body = parsedData;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.map(String),
        }));
        logError(new Error("Validation failed"), "Form validation failed");
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          details,
        });
      }
      next(error);
    }
  };

export const validateQueryParams = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.query);

      if (!result.success) {
        logError(
          new Error("Validation failed"),
          "Query parameter validation failed",
        );

        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: result.error.issues,
        });
      }

      return next();
    } catch (error: any) {
      logError(error, "Unhandled exception in query validation middleware");
      return next(error);
    }
  };
};
