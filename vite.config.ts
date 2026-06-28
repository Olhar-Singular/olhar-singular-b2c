import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
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
  plugins: [react()],
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
  },
  optimizeDeps: {
    include: ["@tanstack/react-query", "buffer"],
  },
});
