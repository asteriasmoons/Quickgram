import type { NextFunction, Request, Response } from "express";
import { miniAppAllowedOrigin } from "../config.js";

export function miniAppCors(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  const allowedOrigin = miniAppAllowedOrigin();
  const requestOrigin = request.header("origin");

  response.setHeader(
    "Access-Control-Allow-Origin",
    allowedOrigin === "*" ? requestOrigin || "*" : allowedOrigin
  );
  response.setHeader("Vary", "Origin");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, x-telegram-init-data"
  );
  response.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }

  next();
}
