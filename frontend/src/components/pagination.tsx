"use client";

import { Button } from "@/components/ui/button";
import type { Paginated } from "@/types";

interface PaginationProps {
  meta: Paginated<unknown>["meta"];
  page: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ meta, page, onPageChange }: PaginationProps) {
  if (meta.last_page <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-between py-4">
      <p className="text-sm text-muted-foreground">
        Page {meta.current_page} of {meta.last_page} ({meta.total} total)
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= meta.last_page}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
