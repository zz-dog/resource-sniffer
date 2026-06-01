import { zip as fflateZip } from "fflate";
import type { Resource } from "./types";

/** 格式化字节大小为人类可读字符串。 */
export function formatSize(n?: number): string {
  if (n == null || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** 把 URL 路径末段转成相对安全的文件名（去掉 query/hash，处理空名）。 */
export function fileNameFromUrl(rawUrl: string, fallbackIndex: number): string {
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
export function uniquify(used: Set<string>, name: string): string {
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
export function downloadBlob(blob: Blob, filename: string): void {
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
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await task(items[i], i);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/** 导出资源为 ZIP 文件。 */
export async function exportZip(
  resources: Resource[],
  pageUrl: string | null,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const usedPerDir = new Map<string, Set<string>>();
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
  const manifest: ManifestEntry[] = new Array(resources.length);

  let done = 0;
  await runWithConcurrency(resources, 6, async (r, i) => {
    let buf: ArrayBuffer | null = null;
    let mimeType: string | undefined;
    let error: string | undefined;
    try {
      const resp = await fetch(r.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      buf = await resp.arrayBuffer();
      mimeType = resp.headers.get("content-type") ?? undefined;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const dir = (r.type || "other").replace(/[^\w.\-]+/g, "_") || "other";
    const baseName = fileNameFromUrl(r.url, i + 1);

    if (buf) {
      const used = usedPerDir.get(dir) ?? new Set<string>();
      usedPerDir.set(dir, used);
      const fname = uniquify(used, baseName);
      const path = `${dir}/${fname}`;
      files[path] = new Uint8Array(buf);
      manifest[i] = { url: r.url, type: r.type, path, ok: true, mimeType, size: buf.byteLength };
    } else {
      manifest[i] = { url: r.url, type: r.type, path: `${dir}/${baseName}`, ok: false, error };
    }

    done++;
    onProgress(done, resources.length);
  });

  // 附一份清单方便对照原始 URL 与抓取结果。
  const rootUsed = new Set<string>(
    Object.keys(files)
      .filter((p) => !p.includes("/"))
      .map((p) => p),
  );
  const indexName = uniquify(rootUsed, "_index.json");
  files[indexName] = new TextEncoder().encode(
    JSON.stringify({ pageUrl, resources: manifest }, null, 2),
  );

  const data = await new Promise<Uint8Array>((resolve, reject) => {
    fflateZip(files, { level: 6 }, (err, out) => {
      if (err) reject(err);
      else resolve(out);
    });
  });
  const blob = new Blob([data as BlobPart], { type: "application/zip" });
  downloadBlob(blob, "resources.zip");
}
