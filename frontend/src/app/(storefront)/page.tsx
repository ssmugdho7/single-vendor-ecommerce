"use client";

import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Pagination } from "@/components/pagination";
import { ProductCard } from "@/components/storefront/product-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import type { Category, Paginated, Product } from "@/types";

function useProductsQuery(params: { category: string; search: string; page: number }) {
  return useQuery({
    queryKey: ["products", params],
    queryFn: async () =>
      (
        await apiClient.get<Paginated<Product>>("/products", {
          params: {
            category: params.category || undefined,
            search: params.search || undefined,
            page: params.page,
          },
        })
      ).data,
  });
}

function useCategoriesQuery() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () =>
      (await apiClient.get<Paginated<Category>>("/categories")).data.data,
  });
}

function ProductsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get("category") ?? "";
  const page = Number(searchParams.get("page") ?? "1");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");

  const { data: categories } = useCategoriesQuery();
  const { data: products, isLoading } = useProductsQuery({ category, search, page });

  function updateParams(next: { category?: string; search?: string; page?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    const merged = { category, search, page, ...next };

    if (merged.category) {
      params.set("category", merged.category);
    } else {
      params.delete("category");
    }

    if (merged.search) {
      params.set("search", merged.search);
    } else {
      params.delete("search");
    }

    if (merged.page && merged.page > 1) {
      params.set("page", String(merged.page));
    } else {
      params.delete("page");
    }

    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>

        <div className="flex gap-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              updateParams({ search, page: 1 });
            }}
          >
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products…"
              className="w-56"
            />
          </form>

          <Select
            value={category || "all"}
            onValueChange={(value) =>
              updateParams({ category: value === "all" ? "" : (value ?? ""), page: 1 })
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories?.map((c) => (
                <SelectItem key={c.id} value={c.slug}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : products && products.data.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.data.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <Pagination
            meta={products.meta}
            page={page}
            onPageChange={(nextPage) => updateParams({ page: nextPage })}
          />
        </>
      ) : (
        <p className="text-muted-foreground">No products found.</p>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <ProductsPageContent />
    </Suspense>
  );
}
