"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import type { FieldErrors } from "@/lib/form-errors";
import type { Category, Paginated } from "@/types";

export interface ProductFormValues {
  category_id: number;
  name: string;
  description: string;
  price: string;
  stock_quantity?: string;
  is_active: boolean;
}

export function ProductForm({
  initialValues,
  onSubmit,
  isSubmitting,
  errors,
  submitLabel,
  showStockQuantity,
}: {
  initialValues?: Partial<ProductFormValues>;
  onSubmit: (values: ProductFormValues) => void;
  isSubmitting: boolean;
  errors: FieldErrors;
  submitLabel: string;
  /** Initial stock is only ever set at creation — edits go through the dedicated stock page. */
  showStockQuantity: boolean;
}) {
  const [categoryId, setCategoryId] = useState(initialValues?.category_id ?? 0);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [price, setPrice] = useState(initialValues?.price ?? "");
  const [stockQuantity, setStockQuantity] = useState(initialValues?.stock_quantity ?? "0");
  const [isActive, setIsActive] = useState(initialValues?.is_active ?? true);

  const { data: categories } = useQuery({
    queryKey: ["admin", "categories", "all"],
    queryFn: async () =>
      (await apiClient.get<Paginated<Category>>("/admin/categories")).data.data,
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      category_id: categoryId,
      name,
      description,
      price,
      stock_quantity: showStockQuantity ? stockQuantity : undefined,
      is_active: isActive,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        {errors.name && <p className="text-sm text-destructive">{errors.name[0]}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="category">Category</Label>
        <Select
          value={categoryId ? String(categoryId) : ""}
          onValueChange={(value) => setCategoryId(Number(value))}
        >
          <SelectTrigger id="category" className="w-full">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {categories?.map((category) => (
              <SelectItem key={category.id} value={String(category.id)}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.category_id && (
          <p className="text-sm text-destructive">{errors.category_id[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {errors.description && <p className="text-sm text-destructive">{errors.description[0]}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="price">Price</Label>
        <Input
          id="price"
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
        {errors.price && <p className="text-sm text-destructive">{errors.price[0]}</p>}
      </div>

      {showStockQuantity && (
        <div className="space-y-1.5">
          <Label htmlFor="stock_quantity">Initial stock</Label>
          <Input
            id="stock_quantity"
            type="number"
            min={0}
            value={stockQuantity}
            onChange={(e) => setStockQuantity(e.target.value)}
            required
          />
          {errors.stock_quantity && (
            <p className="text-sm text-destructive">{errors.stock_quantity[0]}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Checkbox
          id="is_active"
          checked={isActive}
          onCheckedChange={(checked) => setIsActive(checked === true)}
        />
        <Label htmlFor="is_active">Active (visible in the storefront)</Label>
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
