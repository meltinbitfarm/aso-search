import { ItunesError } from "../lib/aso/itunes.js";

export interface ToolErrorPayload {
  code: "invalid_params" | "upstream_error" | "internal_error";
  message: string;
  details?: unknown;
}

export function toErrorPayload(e: unknown): ToolErrorPayload {
  if (e instanceof ItunesError) {
    return {
      code: e.status >= 400 && e.status < 500 ? "invalid_params" : "upstream_error",
      message: e.message,
    };
  }
  if (e instanceof Error) {
    return { code: "internal_error", message: e.message };
  }
  return { code: "internal_error", message: String(e) };
}

export function errorContent(e: unknown) {
  const payload = toErrorPayload(e);
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}
