import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    env: {
      VITE_SUPABASE_URL: "http://localhost:54321",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
    },
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "supabase/functions/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules/**", "dist/**", "src/test/round-trip/**"],
    passWithNoTests: true,
    pool: "forks",
    forks: {
      maxForks: 4,
      minForks: 1,
    },
    maxConcurrency: 10,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "src/**/*.{ts,tsx}",
        "supabase/functions/_shared/**/*.ts",
      ],
      exclude: [
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/integrations/supabase/**",
        "src/vite-env.d.ts",
        "src/main.tsx",
        "src/components/ui/**",
        "src/types/**",
        "src/assets/**",
        "supabase/functions/**/*.test.ts",
        "supabase/functions/**/index.ts",
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      // Map Deno ESM URL imports to local node_modules during Vitest runs
      { find: /^https:\/\/esm\.sh\/@supabase\/supabase-js@2$/, replacement: "@supabase/supabase-js" },
    ],
  },
});
