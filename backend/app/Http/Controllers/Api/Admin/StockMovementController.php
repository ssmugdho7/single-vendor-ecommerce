<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreStockMovementRequest;
use App\Http\Resources\ProductResource;
use App\Http\Resources\StockMovementResource;
use App\Models\Product;
use App\StockMovementType;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class StockMovementController extends Controller
{
    public function index(Product $product): AnonymousResourceCollection
    {
        return StockMovementResource::collection(
            $product->stockMovements()->latest()->paginate()
        );
    }

    public function store(StoreStockMovementRequest $request, Product $product): ProductResource
    {
        $type = StockMovementType::from($request->string('type')->toString());

        $delta = $type === StockMovementType::Restock
            ? $request->integer('quantity')
            : $request->integer('new_quantity') - $product->stock_quantity;

        $product->adjustStock($delta, $type, note: $request->input('note'));

        return ProductResource::make($product->refresh()->load('category'));
    }
}
