"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import { extractErrorMessage } from "@/lib/form-errors";
import type { Order } from "@/types";

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin", "order", id],
    queryFn: async () => (await apiClient.get<{ data: Order }>(`/admin/orders/${id}`)).data.data,
    // Shipment creation happens in a queued job right after payment —
    // poll briefly so "paid" picks up "shipped" without a manual refresh.
    refetchInterval: (query) => (query.state.data?.status === "paid" ? 2000 : false),
  });

  const cancelOrder = useMutation({
    mutationFn: async () => apiClient.patch(`/admin/orders/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "order", id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      toast.success("Order cancelled");
    },
    onError: (error) => toast.error(extractErrorMessage(error, "Could not cancel order")),
  });

  const advanceDelivery = useMutation({
    mutationFn: async (outcome: "transit" | "deliver" | "fail") =>
      apiClient.post(`/deliveries/fake/${order!.delivery!.tracking_id}/${outcome}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "order", id] });
      toast.success("Delivery status updated");
    },
    onError: (error) => toast.error(extractErrorMessage(error, "Could not update delivery")),
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!order) {
    return <p className="text-muted-foreground">Order not found.</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Order #{order.id}</h1>
        <StatusBadge status={order.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>{order.user?.name}</p>
          <p className="text-muted-foreground">{order.user?.email}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipping</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>{order.recipient_name}</p>
          <p>{order.recipient_phone}</p>
          <p className="text-muted-foreground">{order.shipping_address}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>
                {item.product?.name ?? "Deleted product"} × {item.quantity}
              </span>
              <span>${item.line_total.toFixed(2)}</span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between text-lg font-semibold">
            <span>Total</span>
            <span>${order.total_amount.toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      {order.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {order.payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{payment.transaction_id}</span>
                <StatusBadge status={payment.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {order.delivery && (
        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{order.delivery.tracking_id}</span>
              <StatusBadge status={order.delivery.status} />
            </div>

            {order.delivery.status === "pickup_pending" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={advanceDelivery.isPending}
                  onClick={() => advanceDelivery.mutate("transit")}
                >
                  Mark in transit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={advanceDelivery.isPending}
                  onClick={() => advanceDelivery.mutate("fail")}
                >
                  Mark failed
                </Button>
              </div>
            )}

            {order.delivery.status === "in_transit" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={advanceDelivery.isPending}
                  onClick={() => advanceDelivery.mutate("deliver")}
                >
                  Mark delivered
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={advanceDelivery.isPending}
                  onClick={() => advanceDelivery.mutate("fail")}
                >
                  Mark failed
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              These buttons simulate CarryBee&apos;s webhook — a real integration would report
              these transitions on its own.
            </p>
          </CardContent>
        </Card>
      )}

      {order.status === "pending_payment" && (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive">Cancel order</Button>} />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
              <AlertDialogDescription>
                Stock for each item will be restored. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Back</AlertDialogCancel>
              <AlertDialogAction onClick={() => cancelOrder.mutate()}>
                Cancel order
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
