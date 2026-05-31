/**
 * 弹窗 UI：向后台 worker 查询当前活动 tab 的资源列表，按类型 / URL 子串
 * 过滤后渲染，并支持导出 ZIP 文件夹。
 */
import type {
  GetResourcesResponse,
  MessageFromPopup,
  Resource,
} from "./types";
// fflate 由 Vite 打包进 popup.js。
import { zip as fflateZip } from "fflate";

const $ = <T extends Element>(sel: string) => document.querySelector(sel) as T;

const listEl = $("#list") as HTMLDivElement;
const filterEl = $("#filter") as HTMLSelectElement;
const searchEl = $("#search") as HTMLInputElement;
const summaryEl = $("#summary") as HTMLDivElement;

let current: Resource[] = [];
let currentPageUrl: string | null = null;

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) throw new Error("没有活动 tab");
  return tab.id;
}

function send<T = unknown>(msg: MessageFromPopup): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(resp as T);
    });
  });
}

function formatSize(n?: number): string {
  if (n == null || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function render() {
  const q = searchEl.value.trim().toLowerCase();
  const type = filterEl.value;
  const shown = current.filter((r) => {
    if (type && r.type !== type) return false;
    if (q && !r.url.toLowerCase().includes(q)) return false;
    return true;
  });

  // 刷新类型下拉菜单。
  const types = Array.from(new Set(current.map((r) => r.type))).sort();
  const prev = filterEl.value;
  filterEl.innerHTML =
    `<option value="">全部类型 (${current.length})</option>` +
    types
      .map((t) => {
        const n = current.filter((r) => r.type === t).length;
        return `<option value="${t}">${t} (${n})</option>`;
      })
      .join("");
  filterEl.value = prev;

  summaryEl.textContent = currentPageUrl
    ? `${shown.length} / ${current.length} 条资源 · ${currentPageUrl}`
    : `${shown.length} / ${current.length} 条资源`;

  if (!shown.length) {
    listEl.innerHTML = `<div class="empty">没有匹配的资源。</div>`;
    return;
  }

  // 通过 DOM 节点渲染，避免 URL 中字符触发 HTML 注入。
  listEl.innerHTML = "";
  for (const r of shown) {
    const row = document.createElement("div");
    row.className = "item";
    const t = document.createElement("span");
    t.className = "type";
    t.textContent = r.type;
    const u = document.createElement("span");
    u.className = "url";
    u.textContent = r.url;
    u.title = `${r.url}\n${r.method ?? ""} ${r.statusCode ?? ""} ${r.mimeType ?? ""}`;
    u.addEventListener("click", () => {
      chrome.tabs.create({ url: r.url });
    });
    const s = document.createElement("span");
    s.className = "size";
    s.textContent = formatSize(r.size);
    row.append(t, u, s);
    listEl.appendChild(row);
  }
}

async function refresh() {
  const tabId = await activeTabId();
  const resp = await send<GetResourcesResponse>({
    kind: "get-resources",
    tabId,
  });
  current = resp.resources.sort((a, b) =>
    a.type === b.type
      ? a.url.localeCompare(b.url)
      : a.type.localeCompare(b.type),
  );
  currentPageUrl = resp.pageUrl;
  render();
}

$("#refresh").addEventListener("click", async () => {
  const tabId = await activeTabId();
  await send({ kind: "rescan-dom", tabId });
  // 稍等 content script 把消息送回来。
  setTimeout(refresh, 150);
});

$("#clear").addEventListener("click", async () => {
  const tabId = await activeTabId();
  await send({ kind: "clear-resources", tabId });
  current = [];
  render();
});

/** 把 URL 路径末段转成相对安全的文件名（去掉 query/hash，处理空名）。 */
function fileNameFromUrl(rawUrl: string, fallbackIndex: number): string {
  try {
    const u = new URL(rawUrl);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const decoded = (() => {
      try {
        return decodeURIComponent(last);
      } catch {
        return last;
      }
    })();
    // 仅保留文件名常见字符，其它一律替换为 _。
    const safe = decoded.replace(/[^\w.\-]+/g, "_");
    return safe || `resource_${fallbackIndex}`;
  } catch {
    return `resource_${fallbackIndex}`;
  }
}

/** 让目录内的文件名唯一：重名时追加 (1)、(2)…。 */
function uniquify(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; ; i++) {
    const candidate = `${stem}(${i})${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

/** 触发浏览器把 blob 作为附件下载。 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  if (chrome.downloads?.download) {
    chrome.downloads.download({ url, filename, saveAs: true });
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }
  // URL 在下载触发后即可释放。
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

$("#export").addEventListener("click", async () => {
  const btn = $("#export") as HTMLButtonElement;
  if (!current.length) return;
  const original = btn.textContent;
  btn.disabled = true;

  try {
    // 每个子目录维护一份已用文件名集合，避免重名覆盖。
    const usedPerDir = new Map<string, Set<string>>();
    // fflate 的 zip() 接受 { 路径: Uint8Array } 一次性打包，所以这里先收集字节。
    const files: Record<string, Uint8Array> = {};
    const manifest: Array<{
      url: string;
      type: string;
      path: string;
      ok: boolean;
      error?: string;
      mimeType?: string;
      size?: number;
    }> = [];

    let done = 0;
    for (const r of current) {
      done++;
      btn.textContent = `导出中 ${done}/${current.length}`;

      const dir = (r.type || "other").replace(/[^\w.\-]+/g, "_") || "other";
      const used = usedPerDir.get(dir) ?? new Set<string>();
      usedPerDir.set(dir, used);
      const fname = uniquify(used, fileNameFromUrl(r.url, done));
      const path = `${dir}/${fname}`;

      try {
        // popup 运行在扩展上下文中，配合 host_permissions: <all_urls> 可以跨域 fetch。
        const resp = await fetch(r.url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buf = await resp.arrayBuffer();
        files[path] = new Uint8Array(buf);
        manifest.push({
          url: r.url,
          type: r.type,
          path,
          ok: true,
          mimeType: resp.headers.get("content-type") ?? undefined,
          size: buf.byteLength,
        });
      } catch (err) {
        manifest.push({
          url: r.url,
          type: r.type,
          path,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 附一份清单方便对照原始 URL 与抓取结果。
    files["_index.json"] = new TextEncoder().encode(
      JSON.stringify({ pageUrl: currentPageUrl, resources: manifest }, null, 2),
    );

    btn.textContent = "打包中…";
    // fflate 的 zip() 是回调式异步 API（内部走 worker 池），包装成 Promise。
    const data = await new Promise<Uint8Array>((resolve, reject) => {
      fflateZip(files, { level: 6 }, (err, out) => {
        if (err) reject(err);
        else resolve(out);
      });
    });
    const blob = new Blob([data as BlobPart], { type: "application/zip" });
    downloadBlob(blob, "resources.zip");
  } catch (err) {
    alert(`导出失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

filterEl.addEventListener("change", render);
searchEl.addEventListener("input", render);

refresh().catch((err) => {
  listEl.innerHTML = `<div class="empty">出错：${err.message}</div>`;
});
