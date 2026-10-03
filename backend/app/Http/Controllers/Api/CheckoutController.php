<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CheckoutRequest;
use App\Http\Resources\OrderResource;
use App\Models\Cart;
use App\Models\Order;
use App\Models\Product;
use App\StockMovementType;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CheckoutController extends Controller
{
    public function store(CheckoutRequest $request): JsonResponse
    {
        $cart = Cart::forUser($request->user())->load('items');

        if ($cart->items->isEmpty()) {
            throw ValidationException::withMessages([
                'cart' => ['Your cart is empty.'],
            ]);
        }

        $order = DB::transaction(function () use ($cart, $request) {
            $products = Product::query()
                ->whereIn('id', $cart->items->pluck('product_id'))
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $insufficient = $cart->items->filter(
                fn ($item) => $products[$item->product_id]->stock_quantity < $item->quantity
            );

            if ($insufficient->isNotEmpty()) {
                throw ValidationException::withMessages([
                    'stock' => $insufficient
                        ->map(fn ($item) => "Insufficient stock for \"{$products[$item->product_id]->name}\".")
                        ->values()
                        ->all(),
                ]);
            }

            $order = Order::create([
                'user_id' => $cart->user_id,
                'status' => 'pending_payment',
                'total_amount' => $cart->items->sum(
                    fn ($item) => $item->quantity * $products[$item->product_id]->price
                ),
                'recipient_name' => $request->string('recipient_name'),
                'recipient_phone' => $request->string('recipient_phone'),
                'shipping_address' => $request->string('shipping_address'),
            ]);

            foreach ($cart->items as $item) {
                $product = $products[$item->product_id];

                $order->items()->create([
                    'product_id' => $product->id,
                    'unit_price' => $product->price,
                    'quantity' => $item->quantity,
                ]);

                $product->adjustStock(-$item->quantity, StockMovementType::Sale, $order);
            }

            $cart->items()->delete();

            return $order;
        });

        return OrderResource::make($order->load('items.product.category'))
            ->response()
            ->setStatusCode(201);
    }
}
