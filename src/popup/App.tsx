import { useState, useMemo, useCallback } from "react";
import type { Resource } from "../types";
import { exportZip } from "../utils";
import { useChromeResources } from "../useChromeResources";
import { FilterBar } from "./FilterBar";
import { ResourceList } from "./ResourceList";

export function App() {
  const { resources, pageUrl, loading, error, rescan, clear } = useChromeResources();
  const [filterType, setFilterType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  const filtered = useMemo<Resource[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    return resources.filter((r) => {
      if (filterType && r.type !== filterType) return false;
      if (q && !r.url.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [resources, filterType, searchQuery]);

  const handleExport = useCallback(async () => {
    const source = filtered.length ? filtered : resources;
    if (!source.length) return;
    setExporting(true);
    try {
      await exportZip(source.slice(), pageUrl, (done, total) => {
        setExportProgress(`导出中 ${done}/${total}`);
      });
    } catch (err) {
      alert(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }, [filtered, resources, pageUrl]);

  const summaryText = pageUrl
    ? `${filtered.length} / ${resources.length} 条资源 · ${pageUrl}`
    : `${filtered.length} / ${resources.length} 条资源`;

  return (
    <div className="w-[480px] max-h-[600px] flex flex-col m-0 font-[inherit]">
      <FilterBar
        resources={resources}
        filterType={filterType}
        searchQuery={searchQuery}
        onFilterTypeChange={setFilterType}
        onSearchQueryChange={setSearchQuery}
        onRefresh={rescan}
        onExport={handleExport}
        onClear={clear}
        exporting={exporting}
        exportProgress={exportProgress}
      />
      <div className="px-3 py-1.5 text-xs opacity-80">{summaryText}</div>
      <div className="flex-1 overflow-auto px-3 pt-1 pb-3 text-xs">
        {loading && !resources.length ? (
          <div className="py-5 text-center opacity-60">
            {error ? `出错：${error}` : "加载中…"}
          </div>
        ) : (
          <ResourceList resources={filtered} />
        )}
      </div>
    </div>
  );
}
