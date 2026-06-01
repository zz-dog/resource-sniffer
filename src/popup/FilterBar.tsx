import type { Resource } from "../types";

interface FilterBarProps {
  resources: Resource[];
  filterType: string;
  searchQuery: string;
  onFilterTypeChange: (type: string) => void;
  onSearchQueryChange: (query: string) => void;
  onRefresh: () => void;
  onExport: () => void;
  onClear: () => void;
  exporting: boolean;
  exportProgress: string | null;
}

export function FilterBar({
  resources,
  filterType,
  searchQuery,
  onFilterTypeChange,
  onSearchQueryChange,
  onRefresh,
  onExport,
  onClear,
  exporting,
  exportProgress,
}: FilterBarProps) {
  const types = Array.from(new Set(resources.map((r) => r.type))).sort();

  return (
    <header className="px-3 py-2 border-b flex gap-2 items-center flex-wrap">
      <h1 className="text-sm m-0 flex-1">资源嗅探器</h1>
      <select
        className="text-xs px-2 py-1 border rounded"
        value={filterType}
        onChange={(e) => onFilterTypeChange(e.target.value)}
      >
        <option value="">全部类型 ({resources.length})</option>
        {types.map((t) => {
          const n = resources.filter((r) => r.type === t).length;
          return (
            <option key={t} value={t}>
              {t} ({n})
            </option>
          );
        })}
      </select>
      <input
        type="search"
        placeholder="按 URL 过滤…"
        className="text-xs px-2 py-1"
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
      />
      <button className="text-xs px-2 py-1" onClick={onRefresh} disabled={exporting}>
        刷新
      </button>
      <button className="text-xs px-2 py-1" onClick={onExport} disabled={exporting}>
        {exportProgress ?? "导出 ZIP"}
      </button>
      <button className="text-xs px-2 py-1" onClick={onClear} disabled={exporting}>
        清空
      </button>
    </header>
  );
}
