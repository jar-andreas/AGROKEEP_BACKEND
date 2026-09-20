import { Request, Response, NextFunction, RequestHandler } from "express";

// Several controllers type their handler's `req` with a specific
// Request<Params, ResBody, ReqBody, Query> shape (e.g. Request<{ id: string }>)
// rather than the router's default. Typing this parameter with `any` in each
// slot (instead of Express's real defaults, or a bare `Function`) keeps it
// assignable both ways: any of those specifically-typed handlers can be
// passed in, and the wrapped result still satisfies plain RequestHandler for
// router.get/post/etc.
type AsyncHandler = (
  req: Request<any, any, any, any>,
  res: Response<any>,
  next: NextFunction,
) => unknown;

const tryCatchWrapper = (fn: AsyncHandler): RequestHandler => {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};

export default tryCatchWrapper;
