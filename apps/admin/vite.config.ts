import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        admin: fileURLToPath(new URL("./index.html", import.meta.url)),
        "markdown-diagrams": fileURLToPath(
          new URL("./src/public-markdown.ts", import.meta.url),
        ),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "markdown-diagrams"
            ? "assets/markdown-diagrams.js"
            : "assets/[name]-[hash].js",
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
