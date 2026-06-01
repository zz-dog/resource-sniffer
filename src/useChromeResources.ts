import { useState, useCallback, useEffect } from "react";
import type { GetResourcesResponse, MessageFromPopup, Resource } from "./types";

/** Promise 化的 chrome.runtime.sendMessage。 */
function send<T = unknown>(msg: MessageFromPopup): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(resp as T);
    });
  });
}

/** 获取当前活动 tab ID。 */
async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) throw new Error("没有活动 tab");
  return tab.id;
}

export function useChromeResources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const tabId = await activeTabId();
      const resp = await send<GetResourcesResponse>({ kind: "get-resources", tabId });
      const sorted = resp.resources.sort((a, b) =>
        a.type === b.type ? a.url.localeCompare(b.url) : a.type.localeCompare(b.type),
      );
      setResources(sorted);
      setPageUrl(resp.pageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const rescan = useCallback(async () => {
    const tabId = await activeTabId();
    await send({ kind: "rescan-dom", tabId });
    // 稍等 content script 把消息送回来。
    setTimeout(refresh, 150);
  }, [refresh]);

  const clear = useCallback(async () => {
    const tabId = await activeTabId();
    await send({ kind: "clear-resources", tabId });
    setResources([]);
    setPageUrl(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { resources, pageUrl, loading, error, refresh, rescan, clear };
}
