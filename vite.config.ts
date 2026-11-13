import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Vercel exposes the commit as VERCEL_GIT_COMMIT_SHA at build time; it tags
  // both the uploaded source maps and the events the app sends (same release).
  const release = process.env.VERCEL_GIT_COMMIT_SHA || env.VITE_VERCEL_GIT_COMMIT_SHA || undefined;
  // Source maps are uploaded only when a token exists (Vercel production build);
  // without one the build is unchanged and no .map file is emitted.
  const uploadSourcemaps = mode === "production" && Boolean(env.SENTRY_AUTH_TOKEN);

  return {
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Docker bind-mount on Windows/Mac doesn't emit inotify events; polling
    // is required for HMR to detect source changes automatically.
    watch: {
      usePolling: true,
    },
  },
  build: {
    sourcemap: uploadSourcemaps ? "hidden" : false,
  },
  plugins: [
    react(),
    // Must stay last in the plugin list.
    ...(uploadSourcemaps
      ? [
          sentryVitePlugin({
            org: "olhar-singular",
            project: "olhar-singular-b2c-frontend",
            authToken: env.SENTRY_AUTH_TOKEN,
            release: { name: release },
            // Never serve source code to the public: delete the maps once uploaded.
            sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
            telemetry: false,
            // Monitoring must never break a deploy: an upload failure only warns.
            errorHandler: (err) => console.warn(`[sentry] source map upload skipped: ${err.message}`),
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@tanstack/react-query",
      "@radix-ui/react-tooltip",
    ],
  },
  // `@react-pdf/renderer` and its deps assume a Node-like environment. `global`
  // must resolve to `globalThis` in the browser; the `Buffer` global itself is
  // shimmed in main.tsx via the `buffer` package.
  define: {
    global: "globalThis",
    "import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA": JSON.stringify(release ?? ""),
  },
  optimizeDeps: {
    include: ["@tanstack/react-query", "buffer"],
  },
};
});
