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
let filtered: Resource[] = [];
let currentPageUrl: string | null = null;

function applyFilter(): Resource[] {
  const q = searchEl.value.trim().toLowerCase();
  const type = filterEl.value;
  return current.filter((r) => {
    if (type && r.type !== type) return false;
    if (q && !r.url.toLowerCase().includes(q)) return false;
    return true;
  });
}

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
  filtered = applyFilter();
  const shown = filtered;

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

/** 并发执行任务，限制同时进行的数量。 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await task(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

$("#export").addEventListener("click", async () => {
  const btn = $("#export") as HTMLButtonElement;
  const refreshBtn = $("#refresh") as HTMLButtonElement;
  const clearBtn = $("#clear") as HTMLButtonElement;
  if (!current.length) return;
  // 用筛选后的列表导出，并拍快照避免导出过程中 refresh/clear/筛选变化导致清单错位。
  const source = filtered.length ? filtered : applyFilter();
  if (!source.length) return;
  const original = btn.textContent;
  const snapshot = source.slice();
  const snapshotPageUrl = currentPageUrl;
  btn.disabled = true;
  refreshBtn.disabled = true;
  clearBtn.disabled = true;

  try {
    // 每个子目录维护一份已用文件名集合，避免重名覆盖。失败的请求不占用文件名。
    const usedPerDir = new Map<string, Set<string>>();
    // fflate 的 zip() 接受 { 路径: Uint8Array } 一次性打包，所以这里先收集字节。
    const files: Record<string, Uint8Array> = {};
    type ManifestEntry = {
      url: string;
      type: string;
      path: string;
      ok: boolean;
      error?: string;
      mimeType?: string;
      size?: number;
    };
    const manifest: ManifestEntry[] = new Array(snapshot.length);

    let done = 0;
    // 并发抓取，但文件名分配仍要单线程串行做（共享 Set 不能并发改）。
    await runWithConcurrency(snapshot, 6, async (r, i) => {
      let buf: ArrayBuffer | null = null;
      let mimeType: string | undefined;
      let error: string | undefined;
      try {
        // popup 运行在扩展上下文中，配合 host_permissions: <all_urls> 可以跨域 fetch。
        const resp = await fetch(r.url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        buf = await resp.arrayBuffer();
        mimeType = resp.headers.get("content-type") ?? undefined;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }

      // 成功后再占文件名，保证清单里 ok:true 的条目拿到「干净」名字。
      const dir = (r.type || "other").replace(/[^\w.\-]+/g, "_") || "other";
      const baseName = fileNameFromUrl(r.url, i + 1);
      let path: string;
      if (buf) {
        const used = usedPerDir.get(dir) ?? new Set<string>();
        usedPerDir.set(dir, used);
        const fname = uniquify(used, baseName);
        path = `${dir}/${fname}`;
        files[path] = new Uint8Array(buf);
        manifest[i] = {
          url: r.url,
          type: r.type,
          path,
          ok: true,
          mimeType,
          size: buf.byteLength,
        };
      } else {
        // 失败条目记录预期的目录与原始文件名供用户排查，但不写入 zip、不占用槽位。
        manifest[i] = {
          url: r.url,
          type: r.type,
          path: `${dir}/${baseName}`,
          ok: false,
          error,
        };
      }

      done++;
      btn.textContent = `导出中 ${done}/${snapshot.length}`;
    });

    // 附一份清单方便对照原始 URL 与抓取结果。用 uniquify 防止与资源文件同名冲突。
    const rootUsed = new Set<string>(
      Object.keys(files)
        .filter((p) => !p.includes("/"))
        .map((p) => p),
    );
    const indexName = uniquify(rootUsed, "_index.json");
    files[indexName] = new TextEncoder().encode(
      JSON.stringify({ pageUrl: snapshotPageUrl, resources: manifest }, null, 2),
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
    refreshBtn.disabled = false;
    clearBtn.disabled = false;
    btn.textContent = original;
  }
});

filterEl.addEventListener("change", render);
searchEl.addEventListener("input", render);

refresh().catch((err) => {
  listEl.innerHTML = `<div class="empty">出错：${err.message}</div>`;
});
