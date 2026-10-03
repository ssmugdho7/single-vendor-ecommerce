<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\StockMovementType;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $orders = Order::query()->with(['user', 'items.product.category', 'payments'])->latest()->paginate();

        return OrderResource::collection($orders);
    }

    public function show(Order $order): OrderResource
    {
        return OrderResource::make($order->load(['user', 'items.product.category', 'payments']));
    }

    public function cancel(Order $order): OrderResource
    {
        if ($order->status !== 'pending_payment') {
            throw ValidationException::withMessages([
                'status' => ['Only a pending order can be cancelled.'],
            ]);
        }

        DB::transaction(function () use ($order) {
            $order->load('items.product');

            foreach ($order->items as $item) {
                $item->product?->adjustStock(
                    $item->quantity,
                    StockMovementType::Cancellation,
                    $order,
                    "Reversed for cancelled order #{$order->id}"
                );
            }

            $order->update(['status' => 'cancelled']);
        });

        return OrderResource::make($order->load(['user', 'items.product.category', 'payments']));
    }
}
