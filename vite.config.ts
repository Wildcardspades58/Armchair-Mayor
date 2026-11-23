import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const REPO_BASE = "/armchair-mayor/";

export default defineConfig({
  base: REPO_BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["manifest.json", "icon-192.svg", "icon-512.svg"],
      manifest: {
        name: "Armchair Mayor — Civic Governance by Broadsheet & Decree",
        short_name: "Armchair Mayor",
        description:
          "Civic Governance by Broadsheet & Decree, powered by local in-browser WebGPU AI.",
        start_url: REPO_BASE,
        scope: REPO_BASE,
        display: "standalone",
        background_color: "#2B2623",
        theme_color: "#C85A32",
        orientation: "landscape",
        icons: [
          {
            src: `${REPO_BASE}icon-192.svg`,
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
          {
            src: `${REPO_BASE}icon-512.svg`,
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Aggressively cache all static UI assets (HTML, CSS, JS, SVG) so the game boots instantly offline
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json,woff2}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024, // 15 MB allowance for bundled WebLLM chunks
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          webllm: ["@mlc-ai/web-llm"],
          vendor: ["react", "react-dom", "zustand"],
        },
      },
    },
  },
});