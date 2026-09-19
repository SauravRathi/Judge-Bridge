import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    // Output the built extension into dist/
    outDir: "dist",
    emptyOutDir: true,

    rollupOptions: {
      input: {
        popup: resolve(__dirname, "index.html"),
      },
      output: {
        // Chrome extensions need predictable filenames (no content hashes)
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },

    // No code splitting — extension popup loads a single bundle
    cssCodeSplit: false,

    // Inline small assets as base64 (icons, etc.)
    assetsInlineLimit: 4096,
  },

  // Dev server config (for standalone testing outside of extension context)
  server: {
    port: 5173,
    open: false,
  },
});
