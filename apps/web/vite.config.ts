import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// One thing to run in dev: Vite owns the browser, /api and /assets are proxied
// to Fastify. No CORS, no two-URL juggling. In prod Fastify serves dist/ from
// the same origin, so there is one deploy surface.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@relic/core": fileURLToPath(
        new URL("../../packages/relic-core/src/index.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Generated GLBs and concept images are served by Fastify from disk.
      "/assets": { target: "http://localhost:8787", changeOrigin: true },
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        // SSE must not be buffered by the proxy.
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            if (proxyRes.headers["content-type"]?.includes("text/event-stream")) {
              proxyRes.headers["cache-control"] = "no-cache, no-transform";
            }
          });
        },
      },
    },
  },
});
