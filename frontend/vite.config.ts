import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    // Le backend FastAPI (Sprint 2) écoutera sur :8000
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
})
