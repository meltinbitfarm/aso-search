import type { Request, Response, NextFunction } from "express";

function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function bearerAuth(expected: string) {
  if (!expected) {
    throw new Error("MCP_BEARER_TOKEN is not configured");
  }
  return function (req: Request, res: Response, next: NextFunction): void {
    const header = req.header("authorization") ?? "";
    const headerMatch = /^Bearer\s+(.+)$/i.exec(header);
    const headerToken = headerMatch?.[1]?.trim();

    const queryTokenRaw = req.query.token;
    const queryToken =
      typeof queryTokenRaw === "string" ? queryTokenRaw.trim() : undefined;

    const provided = headerToken || queryToken;
    if (!provided || !timingSafeEquals(provided, expected)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}
