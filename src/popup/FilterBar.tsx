import {
  DownloadIcon,
  EraserIcon,
  FilterIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Resource } from "../types";

const ALL_TYPES_VALUE = "__all__";

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
  const selectedTypeLabel = filterType || "全部类型";
  const selectedMenuValue = filterType || ALL_TYPES_VALUE;

  return (
    <header className="space-y-3 border-b bg-muted/25 px-3 py-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-base font-semibold leading-none">
            资源嗅探器
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            捕获页面中的脚本、样式、图片和媒体资源
          </p>
        </div>
        <Badge
          variant="secondary"
          className="shrink-0 rounded-md"
        >
          {resources.length} 项
        </Badge>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
        <div className="relative min-w-0">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="按 URL 搜索"
            className="h-8 pl-8 text-xs"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              " justify-start",
            )}
          >
            <FilterIcon data-icon="inline-start" />
            <span className="truncate">{selectedTypeLabel}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>资源类型</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={selectedMenuValue}
              onValueChange={(value) =>
                onFilterTypeChange(value === ALL_TYPES_VALUE ? "" : value)
              }
            >
              <DropdownMenuRadioItem value={ALL_TYPES_VALUE}>
                全部类型
                <span className="ml-auto text-xs text-muted-foreground">
                  {resources.length}
                </span>
              </DropdownMenuRadioItem>
              {types.map((type) => {
                const count = resources.filter((r) => r.type === type).length;
                return (
                  <DropdownMenuRadioItem
                    key={type}
                    value={type}
                  >
                    <span className="max-w-20 truncate uppercase">{type}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {count}
                    </span>
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="icon-sm"
          onClick={onRefresh}
          disabled={exporting}
          title="刷新"
        >
          <RefreshCwIcon />
        </Button>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            onClick={onExport}
            disabled={exporting || resources.length === 0}
            title={exportProgress ?? "导出 ZIP"}
          >
            <DownloadIcon data-icon="inline-start" />
            <span>{exportProgress ?? "导出"}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClear}
            disabled={exporting || resources.length === 0}
            title="清空"
          >
            <EraserIcon />
          </Button>
        </div>
      </div>
    </header>
  );
}
