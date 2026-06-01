import { useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

  const pageHost = useMemo(() => {
    if (!pageUrl) return "等待页面数据";
    try {
      return new URL(pageUrl).host || pageUrl;
    } catch {
      return pageUrl;
    }
  }, [pageUrl]);

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
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
      <section className="px-3 py-2">
        <Card className="overflow-hidden border-border/70 shadow-none">
          <CardContent className="grid grid-cols-[1fr_auto] gap-3 p-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-muted-foreground">
                当前页面
              </div>
              <div className="truncate text-sm font-medium" title={pageUrl ?? undefined}>
                {pageHost}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-medium text-muted-foreground">
                匹配资源
              </div>
              <div className="tabular-nums text-sm font-semibold">
                {filtered.length}
                <span className="text-muted-foreground"> / {resources.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
      <Separator />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-xs">
        {loading && !resources.length ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            {error ? `出错：${error}` : "加载中…"}
          </div>
        ) : (
          <ResourceList resources={filtered} />
        )}
      </div>
    </div>
  );
}
