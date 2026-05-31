/**
 * Content Script：遍历 DOM（以及少量 CSS 源）以找到网络监听可能遗漏的
 * 资源——例如 data: URL、background-image、尚未触发请求的 preload、
 * srcset 候选项、内联的 <source> 列表等。结果发送给后台 worker，由它
 * 与网络观察结果去重合并。
 */
import type { MessageFromContent, Resource } from "./types";

function toAbs(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, location.href).href;
  } catch {
    return null;
  }
}

/** 从 `srcset` 属性中提取所有 URL。 */
function parseSrcset(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function collectDomResources(): Resource[] {
  const out: Resource[] = [];
  const push = (url: string | null, type: string) => {
    const abs = toAbs(url);
    if (!abs) return;
    if (abs.startsWith("javascript:")) return;
    out.push({ url: abs, type, source: "dom", pageUrl: location.href });
  };

  // 图片
  for (const img of document.querySelectorAll<HTMLImageElement>("img")) {
    push(img.currentSrc || img.src, "image");
    for (const u of parseSrcset(img.getAttribute("srcset"))) push(u, "image");
  }
  for (const src of document.querySelectorAll<HTMLSourceElement>("picture source")) {
    for (const u of parseSrcset(src.getAttribute("srcset"))) push(u, "image");
  }

  // 媒体（音视频）
  for (const v of document.querySelectorAll<HTMLMediaElement>("video, audio")) {
    push((v as HTMLVideoElement).src || v.currentSrc, "media");
    for (const s of v.querySelectorAll<HTMLSourceElement>("source")) {
      push(s.src, "media");
    }
    if (v instanceof HTMLVideoElement) push(v.poster, "image");
  }
  for (const t of document.querySelectorAll<HTMLTrackElement>("track")) {
    push(t.src, "media");
  }

  // 嵌入 / iframe / object
  for (const f of document.querySelectorAll<HTMLIFrameElement>("iframe")) push(f.src, "sub_frame");
  for (const e of document.querySelectorAll<HTMLEmbedElement>("embed")) push(e.src, "object");
  for (const o of document.querySelectorAll<HTMLObjectElement>("object")) push(o.data, "object");

  // 脚本 / 样式表 / 字体 / 预加载
  for (const s of document.querySelectorAll<HTMLScriptElement>("script[src]")) {
    push(s.src, "script");
  }
  for (const l of document.querySelectorAll<HTMLLinkElement>("link[href]")) {
    const rel = (l.rel || "").toLowerCase();
    const as = (l.as || "").toLowerCase();
    let type = "other";
    if (rel.includes("stylesheet")) type = "stylesheet";
    else if (rel.includes("icon")) type = "image";
    else if (rel.includes("preload") || rel.includes("prefetch")) {
      type = as || "other";
    } else if (rel.includes("modulepreload")) type = "script";
    push(l.href, type);
  }

  // CSS 中的 background-image 等（尽力而为：仅同源样式表可读）。
  const urlRe = /url\((['"]?)([^'")]+)\1\)/g;
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | undefined;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // 跨域样式表；浏览器禁止访问
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      const text = rule.cssText;
      if (!text || !text.includes("url(")) continue;
      let m: RegExpExecArray | null;
      urlRe.lastIndex = 0;
      while ((m = urlRe.exec(text)) !== null) {
        push(m[2], rule instanceof CSSFontFaceRule ? "font" : "image");
      }
    }
  }

  return out;
}

const resources = collectDomResources();
if (resources.length) {
  const msg: MessageFromContent = {
    kind: "dom-resources",
    pageUrl: location.href,
    resources,
  };
  chrome.runtime.sendMessage(msg).catch(() => {
    /* popup 没打开 / worker 闲置；忽略即可 */
  });
}
