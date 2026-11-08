import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the app under /<repo-name>/. Override with VITE_BASE if the repo name differs.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: {
    // Spotify accepts only loopback IPs (not "localhost") for http redirect URIs.
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  test: {
    include: ["src/**/*.test.ts", "worker/**/*.test.ts"],
  },
});
