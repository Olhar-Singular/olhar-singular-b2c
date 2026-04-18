import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Round-trip tests require a live Supabase (see src/test/round-trip/README).
    // Run them via `npm run test:round-trip` with env set; default suite is hermetic.
    exclude: ["node_modules/**", "dist/**", "src/test/round-trip/**"],
    // Limitar uso de memória (~60% de 32GB)
    pool: "forks", // Usa processos ao invés de threads (mais estável em memória)
    poolOptions: {
      forks: {
        maxForks: 4, // Limita a 4 workers paralelos
        minForks: 1,
      },
    },
    maxConcurrency: 10, // Máximo de testes concorrentes por worker
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/integrations/supabase/types.ts",
        "src/vite-env.d.ts",
        "src/main.tsx",
      ],
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 60,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
