import { ZodError } from "zod";
import { NextFunction, Request, Response } from "express";
import { logError } from "../config/logger.js";

export const validateFormData =
  (schema: any) =>
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
