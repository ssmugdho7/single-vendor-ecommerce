<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentResource;
use App\Models\Order;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function store(Request $request, Order $order, PaymentService $payments): JsonResponse
    {
        abort_unless($order->user_id === $request->user()->id, 404);

        $result = $payments->initiate($order);

        return response()->json([
            'payment' => PaymentResource::make($result['payment']),
            'gateway_url' => $result['gateway_url'],
        ], 201);
    }
}
