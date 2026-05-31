// 在 tsc 把 JS 输出到 dist/ 之后：
//  1. 把 public/ 里的静态资源（manifest、html）原样拷过去；
//  2. 用 sharp 把 public/icons/icon.svg 渲染成 16/48/128 三个尺寸的 PNG，
//     供 manifest 的 icons 字段使用（Chrome 不支持 SVG 作为扩展图标）。
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(root, "dist");
const pub = resolve(root, "public");

if (!existsSync(dist)) await mkdir(dist, { recursive: true });

// 1) 拷贝静态资源
await cp(pub, dist, { recursive: true });
console.log(`已拷贝 ${pub} -> ${dist}`);

// 2) 渲染图标。dist/icons/icon.svg 是上一步顺带拷过去的，删掉以免误用。
const svgPath = resolve(pub, "icons/icon.svg");
const svg = await readFile(svgPath);
const iconsDir = resolve(dist, "icons");
if (!existsSync(iconsDir)) await mkdir(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const out = resolve(iconsDir, `icon${size}.png`);
  await sharp(svg, { density: 384 }) // 提高栅格化密度，小尺寸更清晰
    .resize(size, size)
    .png()
    .toFile(out);
  console.log(`已生成 ${out}`);
}

const distSvg = resolve(iconsDir, "icon.svg");
if (existsSync(distSvg)) await rm(distSvg);
