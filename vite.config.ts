import { defineConfig } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Простой плагин: копирует статику в outDir при каждой сборке
function copyStaticFiles(): import("vite").Plugin {
  return {
    name: "aureus-copy-static",
    closeBundle() {
      const outDir = path.resolve(__dirname, "module");

      // 1. module.json → module/module.json
      fs.copyFileSync(
        path.resolve(__dirname, "module.json"),
        path.join(outDir, "module.json")
      );

      // 2. templates/ → module/templates/
      const src = path.resolve(__dirname, "templates");
      const dst = path.join(outDir, "templates");
      if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });

      for (const file of fs.readdirSync(src)) {
        fs.copyFileSync(path.join(src, file), path.join(dst, file));
      }

      console.log("[aureus] Static files copied to module/");
    },
  };
}

export default defineConfig({
  plugins: [copyStaticFiles()],
  build: {
    // Не создаём index.html — Foundry подключает скрипт напрямую
    lib: {
      entry: path.resolve(__dirname, "src/module.ts"),
      name: "aureus",
      formats: ["es"],
      fileName: () => "module.js",
    },
    outDir: "module",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Все стили собираются в один файл
        assetFileNames: "styles/[name][extname]",
      },
    },
    sourcemap: true,
    minify: false, // Выключаем для дебага
  },
});
