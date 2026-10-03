"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import { extractErrorMessage } from "@/lib/form-errors";
import { useCustomerAuth } from "@/lib/auth/customer-auth";
import type { Product } from "@/types";

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useCustomerAuth();
  const [quantity, setQuantity] = useState(1);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", slug],
    queryFn: async () => (await apiClient.get<{ data: Product }>(`/products/${slug}`)).data.data,
  });

  const addToCart = useMutation({
    mutationFn: async () =>
      apiClient.post("/cart/items", { product_id: product!.id, quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      toast.success("Added to cart");
    },
    onError: (error) => toast.error(extractErrorMessage(error, "Could not add to cart")),
  });

  function handleAddToCart() {
    if (!user) {
      router.push(`/login?next=/products/${slug}`);
      return;
    }

    addToCart.mutate();
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!product) {
    return <p className="text-muted-foreground">Product not found.</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        {product.category && (
          <p className="text-sm text-muted-foreground">{product.category.name}</p>
        )}
        <h1 className="text-2xl font-semibold">{product.name}</h1>
      </div>

      <p className="text-3xl font-bold">${product.price.toFixed(2)}</p>

      <p className="text-muted-foreground">{product.description ?? "No description available."}</p>

      <p className="text-sm text-muted-foreground">
        {product.stock_quantity > 0
          ? `${product.stock_quantity} in stock`
          : "Currently out of stock"}
      </p>

      <div className="flex items-center gap-3">
        <Input
          type="number"
          min={1}
          max={Math.max(product.stock_quantity, 1)}
          value={quantity}
          onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))}
          className="w-20"
          disabled={product.stock_quantity === 0}
        />
        <Button
          onClick={handleAddToCart}
          disabled={product.stock_quantity === 0 || addToCart.isPending}
        >
          {addToCart.isPending ? "Adding…" : "Add to cart"}
        </Button>
      </div>
    </div>
  );
}
