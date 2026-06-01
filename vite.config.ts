import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import sharp from "sharp";

/**
 * Vite 插件：构建结束后用 sharp 把 public/icons/icon.svg 渲染成
 * 16/48/128 三个尺寸的 PNG，并删掉 dist 里的 SVG 副本。
 */
function sharpIcons(): Plugin {
  return {
    name: "sharp-icons",
    async closeBundle() {
      const root = resolve(__dirname);
      const svgPath = resolve(root, "public/icons/icon.svg");
      const iconsDir = resolve(root, "dist/icons");
      if (!existsSync(svgPath)) return;

      const svg = await readFile(svgPath);
      const { mkdir } = await import("node:fs/promises");
      if (!existsSync(iconsDir)) await mkdir(iconsDir, { recursive: true });

      for (const size of [16, 48, 128]) {
        const out = resolve(iconsDir, `icon${size}.png`);
        await sharp(svg, { density: 384 })
          .resize(size, size)
          .png()
          .toFile(out);
      }

      const distSvg = resolve(iconsDir, "icon.svg");
      if (existsSync(distSvg)) await rm(distSvg);
    },
  };
}

export default defineConfig({
  base: "",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Chrome 扩展需要固定文件名，不用 hash
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        background: resolve(__dirname, "src/background.ts"),
        content: resolve(__dirname, "src/content.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    // 不内联 CSS / JS 到 HTML（扩展需要独立文件）
    cssCodeSplit: true,
  },
  plugins: [react(), tailwindcss(), sharpIcons()],
});
