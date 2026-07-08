import { z } from "zod";

const envSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgres://autozap:autozap@localhost:5432/autozap"),
  MEILI_HOST: z.string().url().default("http://localhost:7700"),
  MEILI_MASTER_KEY: z.string().min(16).optional(),
  MEILI_SEARCH_KEY: z.string().optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  YANDEX_MAPS_API_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);
