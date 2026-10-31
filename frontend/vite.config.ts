import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * TESSERA frontend dev server.
 *
 * The scheduling backend is a separate FastAPI service (owned independently, never edited
 * from here). During development we proxy its routes so the browser only ever talks to one
 * origin — that keeps the sandboxed preview working and avoids CORS entirely.
 *
 * Override the backend location with TESSERA_API (default http://127.0.0.1:8000).
 */
const backend = process.env.TESSERA_API ?? "http://127.0.0.1:8000";

const proxy = {
  "/api": { target: backend, changeOrigin: true },
  "/health": { target: backend, changeOrigin: true },
  "/docs": { target: backend, changeOrigin: true },
  "/openapi.json": { target: backend, changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // The Arena preview is served from a generated host; allow any Host header so the
    // dev server does not reject it.
    allowedHosts: true,
    proxy,
  },
  preview: { host: "0.0.0.0", port: 4173, allowedHosts: true, proxy },
  build: { outDir: "dist", sourcemap: false },
});
