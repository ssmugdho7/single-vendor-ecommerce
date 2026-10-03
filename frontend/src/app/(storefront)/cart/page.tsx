"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/hooks/use-cart";
import { apiClient } from "@/lib/api-client";
import { useCustomerAuth } from "@/lib/auth/customer-auth";
import { extractErrorMessage } from "@/lib/form-errors";

export default function CartPage() {
  const { user, isLoading: authLoading } = useCustomerAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: cart, isLoading } = useCart();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?next=/cart");
    }
  }, [authLoading, user, router]);

  const updateQuantity = useMutation({
    mutationFn: async ({ itemId, quantity }: { itemId: number; quantity: number }) =>
      apiClient.patch(`/cart/items/${itemId}`, { quantity }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart"] }),
    onError: (error) => toast.error(extractErrorMessage(error, "Could not update quantity")),
  });

  const removeItem = useMutation({
    mutationFn: async (itemId: number) => apiClient.delete(`/cart/items/${itemId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart"] }),
    onError: (error) => toast.error(extractErrorMessage(error, "Could not remove item")),
  });

  if (authLoading || isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Your cart</h1>
        <p className="text-muted-foreground">
          Your cart is empty.{" "}
          <Link href="/" className="underline">
            Browse products
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Your cart</h1>

      <div className="space-y-4">
        {cart.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-4 border-b pb-4">
            <div>
              <Link href={`/products/${item.product.slug}`} className="font-medium hover:underline">
                {item.product.name}
              </Link>
              <p className="text-sm text-muted-foreground">${item.product.price.toFixed(2)} each</p>
            </div>

            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                value={item.quantity}
                className="w-20"
                onChange={(event) => {
                  const quantity = Math.max(1, Number(event.target.value));
                  updateQuantity.mutate({ itemId: item.id, quantity });
                }}
              />
              <span className="w-20 text-right font-medium">${item.line_total.toFixed(2)}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeItem.mutate(item.id)}
                disabled={removeItem.isPending}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <span className="text-xl font-semibold">Total: ${cart.total.toFixed(2)}</span>
        <Button nativeButton={false} render={<Link href="/checkout">Proceed to checkout</Link>} />
      </div>
    </div>
  );
}
