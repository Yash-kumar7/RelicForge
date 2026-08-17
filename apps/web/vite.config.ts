import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// One thing to run in dev: Vite owns the browser, /api and /assets are proxied
// to Fastify. No CORS, no two-URL juggling. In prod Fastify serves dist/ from
// the same origin, so there is one deploy surface.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    /*
     * The client's own bundles go to /static, not /assets.
     *
     * /assets already means something in this project: it is where every
     * generated model, rig and concept image is served from. Vite's default
     * output directory is also called assets, so in production the two met at
     * one URL prefix — and because the generated-asset route is registered
     * first, every request for the app's own JavaScript and CSS was answered by
     * searching among the GLBs and returning 404.
     *
     * The result is a page that loads its HTML and executes nothing at all.
     *
     * Renaming one side is the entire fix, and the client is the side to rename:
     * its URLs are emitted by the build and referenced by nothing else, while
     * /assets paths are written throughout the app and recorded in every stored
     * relic.
     */
    assetsDir: "static",
  },
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
