/**
 * Service Worker（MV3）：监听 webRequest 事件，按 tab 存储所有观察到的
 * 资源；同时转发来自 popup 和 content script 的消息。
 */
import type {
  GetResourcesResponse,
  MessageFromContent,
  MessageFromPopup,
  Resource,
} from "./types";
import { is3dUrl, is3dMimeType } from "./types";

/** tabId -> (url -> Resource)。用 Map 可以保留每个 URL 的最新记录。 */
const perTab = new Map<number, Map<string, Resource>>();

function bucket(tabId: number): Map<string, Resource> {
  let m = perTab.get(tabId);
  if (!m) {
    m = new Map();
    perTab.set(tabId, m);
  }
  return m;
}

/** 把一次新观察合并进 tab 的桶里，优先保留更完整的数据。 */
function upsert(tabId: number, next: Resource): void {
  const map = bucket(tabId);
  const prev = map.get(next.url);
  if (!prev) {
    map.set(next.url, next);
    return;
  }
  map.set(next.url, {
    ...prev,
    ...next,
    // 已知的 size / mime 不要被 undefined 覆盖。
    size: next.size ?? prev.size,
    mimeType: next.mimeType ?? prev.mimeType,
    statusCode: next.statusCode ?? prev.statusCode,
    method: next.method ?? prev.method,
  });
}

// --- webRequest 钩子 ---------------------------------------------------------

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return; // 后台 / 扩展自身发起的请求
    upsert(details.tabId, {
      url: details.url,
      type: is3dUrl(details.url) ? "3d" : details.type,
      method: details.method,
      timeStamp: details.timeStamp,
      source: "network",
    });
  },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const headers = details.responseHeaders ?? [];
    const find = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name)?.value;
    const mimeType = find("content-type")?.split(";")[0]?.trim();
    const len = find("content-length");
    upsert(details.tabId, {
      url: details.url,
      type: is3dUrl(details.url) || is3dMimeType(mimeType) ? "3d" : details.type,
      method: details.method,
      statusCode: details.statusCode,
      mimeType,
      size: len ? Number(len) : undefined,
      timeStamp: details.timeStamp,
      source: "network",
    });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// 顶层 frame 跳转时清空 tab 的桶，让 popup 只展示当前页的资源。
chrome.webNavigation?.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) perTab.delete(details.tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => perTab.delete(tabId));

// --- 消息路由 ----------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (
    msg: MessageFromPopup | MessageFromContent,
    sender,
    sendResponse: (r?: unknown) => void
  ) => {
    if (msg.kind === "dom-resources") {
      const tabId = sender.tab?.id;
      if (tabId == null) return;
      for (const r of msg.resources) upsert(tabId, r);
      sendResponse({ ok: true });
      return;
    }

    if (msg.kind === "get-resources") {
      // 按需注入 content script 扫描 DOM，而非在所有页面常驻
      chrome.scripting
        .executeScript({
          target: { tabId: msg.tabId, allFrames: true },
          files: ["content.js"],
        })
        .catch(() => {/* 受保护页面（如 chrome://）无法注入，忽略 */})
        .then(() => new Promise<void>((r) => setTimeout(r, 100)))
        .then(() => {
          const map = perTab.get(msg.tabId);
          chrome.tabs.get(msg.tabId, (tab) => {
            const resp: GetResourcesResponse = {
              pageUrl: tab?.url ?? null,
              resources: map ? Array.from(map.values()) : [],
            };
            sendResponse(resp);
          });
        });
      return true; // 异步响应
    }

    if (msg.kind === "clear-resources") {
      perTab.delete(msg.tabId);
      sendResponse({ ok: true });
      return;
    }

    if (msg.kind === "rescan-dom") {
      chrome.scripting
        .executeScript({
          target: { tabId: msg.tabId, allFrames: true },
          files: ["content.js"],
        })
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true; // 异步响应
    }
  }
);
