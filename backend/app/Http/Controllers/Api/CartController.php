<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AddCartItemRequest;
use App\Http\Requests\UpdateCartItemRequest;
use App\Http\Resources\CartResource;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use Illuminate\Http\Request;

class CartController extends Controller
{
    public function show(Request $request): CartResource
    {
        $cart = Cart::forUser($request->user());

        return CartResource::make($cart->load('items.product.category'));
    }

    public function addItem(AddCartItemRequest $request): CartResource
    {
        $cart = Cart::forUser($request->user());
        $product = Product::findOrFail($request->integer('product_id'));

        abort_unless($product->is_active, 422, 'This product is not available.');

        $item = $cart->items()->firstOrNew(['product_id' => $product->id]);
        $item->quantity = $item->exists
            ? $item->quantity + $request->integer('quantity')
            : $request->integer('quantity');
        $item->save();

        return CartResource::make($cart->load('items.product.category'));
    }

    public function updateItem(UpdateCartItemRequest $request, CartItem $cartItem): CartResource
    {
        $cart = Cart::forUser($request->user());
        abort_unless($cartItem->cart_id === $cart->id, 404);

        $cartItem->update(['quantity' => $request->integer('quantity')]);

        return CartResource::make($cart->load('items.product.category'));
    }

    public function removeItem(Request $request, CartItem $cartItem): CartResource
    {
        $cart = Cart::forUser($request->user());
        abort_unless($cartItem->cart_id === $cart->id, 404);

        $cartItem->delete();

        return CartResource::make($cart->load('items.product.category'));
    }
}
