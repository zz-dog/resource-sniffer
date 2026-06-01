import { Card, CardContent } from "@/components/ui/card";
import type { Resource } from "../types";
import { ResourceRow } from "./ResourceRow";

interface ResourceListProps {
  resources: Resource[];
}

export function ResourceList({ resources }: ResourceListProps) {
  if (!resources.length) {
    return (
      <Card className="border-dashed shadow-none">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          没有匹配的资源。
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {resources.map((r) => (
        <ResourceRow key={r.url} resource={r} />
      ))}
    </div>
  );
}
