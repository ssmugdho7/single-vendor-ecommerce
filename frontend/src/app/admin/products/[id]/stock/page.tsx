"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { extractErrorMessage, extractFieldErrors, type FieldErrors } from "@/lib/form-errors";
import type { Paginated, Product, StockMovement } from "@/types";

export default function ProductStockPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [type, setType] = useState<"restock" | "correction">("restock");
  const [quantity, setQuantity] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ["admin", "product", id],
    queryFn: async () => (await apiClient.get<{ data: Product }>(`/admin/products/${id}`)).data.data,
  });

  const { data: movements, isLoading: movementsLoading } = useQuery({
    queryKey: ["admin", "product", id, "stock-movements"],
    queryFn: async () =>
      (
        await apiClient.get<Paginated<StockMovement>>(
          `/admin/products/${id}/stock-movements`,
        )
      ).data.data,
  });

  const adjustStock = useMutation({
    mutationFn: async () =>
      apiClient.post(`/admin/products/${id}/stock-movements`, {
        type,
        quantity: type === "restock" ? quantity : undefined,
        new_quantity: type === "correction" ? newQuantity : undefined,
        note: note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "product", id] });
      toast.success("Stock updated");
      setQuantity("");
      setNewQuantity("");
      setNote("");
    },
    onError: (error) => {
      setErrors(extractFieldErrors(error));
      toast.error(extractErrorMessage(error, "Could not adjust stock"));
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    adjustStock.mutate();
  }

  if (productLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Stock — {product?.name}</h1>
        <p className="text-muted-foreground">
          Current stock: <span className="font-medium">{product?.stock_quantity}</span>
        </p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Adjust stock</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="type">Adjustment type</Label>
              <Select value={type} onValueChange={(value) => setType(value as typeof type)}>
                <SelectTrigger id="type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restock">Restock (add quantity)</SelectItem>
                  <SelectItem value="correction">Correction (set exact value)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {type === "restock" ? (
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Quantity to add</Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
                {errors.quantity && <p className="text-sm text-destructive">{errors.quantity[0]}</p>}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="new_quantity">Correct stock to</Label>
                <Input
                  id="new_quantity"
                  type="number"
                  min={0}
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                  required
                />
                {errors.new_quantity && (
                  <p className="text-sm text-destructive">{errors.new_quantity[0]}</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <Button type="submit" disabled={adjustStock.isPending}>
              {adjustStock.isPending ? "Saving…" : "Apply adjustment"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Movement history</h2>
        {movementsLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements?.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell>{new Date(movement.created_at).toLocaleString()}</TableCell>
                  <TableCell className="capitalize">{movement.type}</TableCell>
                  <TableCell className={movement.quantity_change < 0 ? "text-destructive" : ""}>
                    {movement.quantity_change > 0 ? "+" : ""}
                    {movement.quantity_change}
                  </TableCell>
                  <TableCell>{movement.order_id ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{movement.note ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
