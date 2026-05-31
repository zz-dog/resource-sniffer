/**
 * 弹窗 UI：向后台 worker 查询当前活动 tab 的资源列表，按类型 / URL 子串
 * 过滤后渲染，并支持导出 JSON。
 */
import type {
  GetResourcesResponse,
  MessageFromPopup,
  Resource,
} from "./types.js";

const $ = <T extends Element>(sel: string) =>
  document.querySelector(sel) as T;

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
  const resp = await send<GetResourcesResponse>({ kind: "get-resources", tabId });
  current = resp.resources.sort((a, b) =>
    a.type === b.type ? a.url.localeCompare(b.url) : a.type.localeCompare(b.type)
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

$("#export").addEventListener("click", () => {
  const blob = new Blob(
    [JSON.stringify({ pageUrl: currentPageUrl, resources: current }, null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  chrome.downloads?.download
    ? chrome.downloads.download({ url, filename: "resources.json", saveAs: true })
    : (() => {
        const a = document.createElement("a");
        a.href = url;
        a.download = "resources.json";
        a.click();
      })();
});

filterEl.addEventListener("change", render);
searchEl.addEventListener("input", render);

refresh().catch((err) => {
  listEl.innerHTML = `<div class="empty">出错：${err.message}</div>`;
});
