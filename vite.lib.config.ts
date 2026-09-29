import { defineConfig } from "vite";
export default defineConfig({
  build: {
    outDir: "dist/library",
    emptyOutDir: true,
    lib: { entry: { index: "src/index.ts", preview: "src/preview/index.tsx", vue: "src/vue/index.ts", "vue-preview": "src/preview-vue/index.ts" }, formats: ["es"], fileName: (_format, name) => `${name}.js` },
    rollupOptions: {
      output: { banner: '"use client";' },
      external: ["react", "react-dom", "react/jsx-runtime", "vue", "zod"],
    },
    sourcemap: true,
  },
});
