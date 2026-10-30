import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          SESSION_ENCRYPTION_KEY: "11".repeat(32),
          VALIDATOR_TOKEN: "validator-secret",
          ADMIN_IDS: "1",
          GITHUB_APP_SLUG: "nemesis-test",
          GITHUB_WEBHOOK_SECRET: "webhook-secret",
        },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
});
