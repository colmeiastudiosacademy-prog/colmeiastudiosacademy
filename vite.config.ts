import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/oauth\//,
          /^\/mcp/,
          /^\/setup/,
          /^\/\.well-known\//,
        ],
      },
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Colmeia CRM",
        short_name: "Colmeia",
        description: "Sua prospecção, em movimento.",
        lang: "pt-BR",
        theme_color: "#f43f8e",
        background_color: "#101014",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
});
