/** 从网络或 DOM 收集到的、统一格式的资源记录。 */
export interface Resource {
  /** 资源的绝对 URL。 */
  url: string;
  /** 网络项使用 Chrome 的 `ResourceType`，DOM 项使用推导出的标签。 */
  type: string;
  /** HTTP 方法（仅网络项有）。 */
  method?: string;
  /** 响应状态码（仅网络项有）。 */
  statusCode?: number;
  /** 响应的 Content-Type 头（如果已知）。 */
  mimeType?: string;
  /** 响应体大小，单位字节（尽力而为，未知时为 -1）。 */
  size?: number;
  /** 观察到该资源时所在的页面 URL（顶层 frame）。 */
  pageUrl?: string;
  /** 首次见到该请求的时间戳（毫秒）。 */
  timeStamp?: number;
  /** 来源："network" 表示来自 webRequest，"dom" 表示来自 DOM 扫描。 */
  source: "network" | "dom";
}

export type MessageFromContent =
  | { kind: "dom-resources"; pageUrl: string; resources: Resource[] };

export type MessageFromPopup =
  | { kind: "get-resources"; tabId: number }
  | { kind: "clear-resources"; tabId: number }
  | { kind: "rescan-dom"; tabId: number };

export interface GetResourcesResponse {
  pageUrl: string | null;
  resources: Resource[];
}

// --- 3D 资源识别 ---

/** 3D 资源文件扩展名正则（不含 .bin —— 太通用，误报率高）。 */
export const _3D_EXT_RE =
  /\.(glb|gltf|obj|fbx|dae|stl|ply|usdz|hdr|exr|ktx|ktx2|babylon|wrl|3ds)(\?.*)?$/i;

/** 判断 URL 是否指向 3D 资源（基于文件扩展名）。 */
export function is3dUrl(url: string): boolean {
  const path = url.split("?")[0].split("#")[0];
  return _3D_EXT_RE.test(path);
}

/** 3D 相关 MIME 类型集合。 */
export const _3D_MIME_TYPES = new Set([
  "model/gltf-binary",
  "model/gltf+json",
  "model/obj",
  "model/stl",
  "model/ply",
  "model/vnd.usdz+zip",
  "model/fbx",
  "model/collada+xml",
  "image/vnd.ktx",
  "image/ktx2",
  "image/vnd.radiance",
]);

/** 判断 MIME 类型是否为 3D 资源。 */
export function is3dMimeType(mime: string | undefined): boolean {
  if (!mime) return false;
  return _3D_MIME_TYPES.has(mime.toLowerCase().split(";")[0].trim());
}
