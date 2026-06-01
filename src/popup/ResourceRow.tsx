import type { Resource } from "../types";
import { formatSize } from "../utils";

interface ResourceRowProps {
  resource: Resource;
}

export function ResourceRow({ resource: r }: ResourceRowProps) {
  const handleClick = () => {
    chrome.tabs.create({ url: r.url });
  };

  return (
    <div className="grid grid-cols-[60px_1fr_auto] gap-1.5 py-1 border-b border-dashed border-[#8883] items-center">
      <span className="type">{r.type}</span>
      <span
        className="url overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer"
        title={`${r.url}\n${r.method ?? ""} ${r.statusCode ?? ""} ${r.mimeType ?? ""}`}
        onClick={handleClick}
      >
        {r.url}
      </span>
      <span className="opacity-60 tabular-nums">{formatSize(r.size)}</span>
    </div>
  );
}
