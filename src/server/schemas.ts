import { z } from "zod";

export const countrySchema = z
  .string()
  .length(2)
  .transform((s) => s.toLowerCase())
  .default("us");

export const storeSchema = z.literal("app_store").default("app_store");

export const keywordCheckInput = {
  keywords: z
    .array(z.string().trim().min(1).max(100))
    .min(1, "at least one keyword required")
    .max(20, "max 20 keywords per call"),
  country: countrySchema,
  store: storeSchema,
};

export const topAppsInput = {
  keyword: z.string().trim().min(1),
  country: countrySchema,
  limit: z.number().int().min(1).max(50).default(10),
};

export const appDetailsInput = {
  app_id: z.string().regex(/^\d+$/, "app_id must be numeric"),
  country: countrySchema,
};

export const keywordSuggestionsInput = {
  seed: z.string().trim().min(1),
  country: countrySchema,
  limit: z.number().int().min(1).max(25).default(10),
};

export type KeywordCheckArgs = {
  keywords: string[];
  country: string;
  store: "app_store";
};

export type TopAppsArgs = {
  keyword: string;
  country: string;
  limit: number;
};

export type AppDetailsArgs = {
  app_id: string;
  country: string;
};

export type KeywordSuggestionsArgs = {
  seed: string;
  country: string;
  limit: number;
};
