import {Request,Response,NextFunction} from "express";
import {sendTsRestError} from "../lib/responseHandler.js"

//middleware to check if user is authenticated (has valid session)
export const isAuthenticated = (
  req:Request,
  res:Response,
  next:NextFunction
):void => {
  if (!req.session || !req.session.userId){
    sendTsRestError(res, 401 , "Unauthorized.Please log in to continue");
    return;
  }
  next();
};

//middleware to restrict access to admins only
export const isAdmin = (
  req:Request,
  res:Response,
  next:NextFunction
):void => {
  if (!req.session || !req.session.userId) {
    sendTsRestError(res, 401 , "Unauthorized.Please log in to continue");
    return;
  }
  if (req.session.role !=="admin"){
    sendTsRestError(res,403, "Unauthorized. Admin access required");
    return;
  }
  next();
};