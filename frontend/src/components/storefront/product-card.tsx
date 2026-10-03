import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { Product } from "@/types";

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link href={`/products/${product.slug}`}>
      <Card className="h-full transition-colors hover:border-primary">
        <CardHeader>
          <CardTitle className="line-clamp-1">{product.name}</CardTitle>
          {product.category && (
            <p className="text-sm text-muted-foreground">{product.category.name}</p>
          )}
        </CardHeader>
        <CardContent>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {product.description ?? "No description available."}
          </p>
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <span className="text-lg font-semibold">${product.price.toFixed(2)}</span>
          <span className="text-sm text-muted-foreground">
            {product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : "Out of stock"}
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}
