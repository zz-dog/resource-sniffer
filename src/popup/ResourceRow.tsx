import { CopyIcon, ExternalLinkIcon, MoreHorizontalIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Resource } from "../types";
import { formatSize } from "../utils";

interface ResourceRowProps {
  resource: Resource;
}

export function ResourceRow({ resource: r }: ResourceRowProps) {
  const openResource = () => {
    chrome.tabs.create({ url: r.url });
  };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(r.url);
  };

  const statusTone =
    r.statusCode && r.statusCode >= 400
      ? "text-destructive"
      : r.statusCode && r.statusCode >= 300
        ? "text-amber-600"
        : "text-muted-foreground";

  return (
    <Card className="group grid grid-cols-[1fr_auto] items-center gap-2 border-border/70 p-2 shadow-none transition-colors hover:bg-muted/40">
      <button
        className="min-w-0 text-left outline-none"
        title={`${r.url}\n${r.method ?? ""} ${r.statusCode ?? ""} ${r.mimeType ?? ""}`}
        onClick={openResource}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Badge variant="secondary" className="h-5 max-w-20 shrink-0 rounded-md px-1.5 text-[10px] uppercase">
            <span className="truncate">{r.type}</span>
          </Badge>
          {r.statusCode ? (
            <span className={cn("text-[11px] tabular-nums", statusTone)}>
              {r.statusCode}
            </span>
          ) : null}
          <span className="text-[11px] text-muted-foreground">
            {r.source === "network" ? "network" : "dom"}
          </span>
        </div>
        <div className="mt-1 truncate text-xs font-medium text-foreground group-hover:text-primary">
          {r.url}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
          <span className="shrink-0 tabular-nums">{formatSize(r.size)}</span>
          {r.mimeType ? <span className="truncate">{r.mimeType}</span> : null}
        </div>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "opacity-70 group-hover:opacity-100"
          )}
          aria-label="资源操作"
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem onClick={openResource}>
            <ExternalLinkIcon />
            打开
          </DropdownMenuItem>
          <DropdownMenuItem onClick={copyUrl}>
            <CopyIcon />
            复制 URL
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Card>
  );
}
