import dotenv from "dotenv";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, "..");
const repoRoot = path.resolve(apiRoot, "../..");

// One .env at the repo root, shared by every workspace. Local overrides win.
dotenv.config({ path: path.join(apiRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const EnvSchema = z.object({
  MESHY_API_KEY: z.string().min(1, "MESHY_API_KEY is required").startsWith("msy_"),
  PORT: z.coerce.number().int().positive().default(8787),
  /**
   * Where the client is hosted, when it is not hosted here.
   *
   * Empty by default, which is the deployment this was built around: Fastify
   * serves the built client, the API and the assets from one origin, so there is
   * no cross-origin request to permit and nothing to configure.
   *
   * Set it when the client lives somewhere else, a static host in front of this
   * one, and that origin alone is allowed. Deliberately not a wildcard: the API
   * spends credits, so anything that can reach it can spend them.
   */
  CLIENT_ORIGIN: z.string().url().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  STORAGE_DIR: z.string().default("./storage"),
  CACHE_DIR: z.string().default("./cache"),
  CREDIT_FLOOR: z.coerce.number().int().nonnegative().default(100),
});

const parsed = EnvSchema.safeParse(process.env);

// Fail at boot, loudly. Discovering a missing key three minutes into a
// generation is the worst possible time to learn about it.
if (!parsed.success) {
  console.error("\n✗ Invalid environment:\n");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\nCopy .env.example to .env and fill it in.\n");
  process.exit(1);
}

export const env = {
  ...parsed.data,
  storageDir: path.resolve(apiRoot, parsed.data.STORAGE_DIR),
  cacheDir: path.resolve(apiRoot, parsed.data.CACHE_DIR),
} as const;
