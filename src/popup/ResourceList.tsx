import type { Resource } from "../types";
import { ResourceRow } from "./ResourceRow";

interface ResourceListProps {
  resources: Resource[];
}

export function ResourceList({ resources }: ResourceListProps) {
  if (!resources.length) {
    return (
      <div className="py-5 text-center opacity-60">没有匹配的资源。</div>
    );
  }

  return (
    <>
      {resources.map((r) => (
        <ResourceRow key={r.url} resource={r} />
      ))}
    </>
  );
}
