import { Badge } from "@/components/ui/badge";

const VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending_payment: "secondary",
  pending: "secondary",
  pickup_pending: "secondary",
  paid: "default",
  success: "default",
  shipped: "default",
  in_transit: "default",
  delivered: "default",
  cancelled: "destructive",
  failed: "destructive",
  delivery_failed: "destructive",
};

function label(status: string): string {
  return status
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANTS[status] ?? "outline"}>{label(status)}</Badge>;
}
