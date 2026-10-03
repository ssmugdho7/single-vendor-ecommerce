<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentResource;
use App\Services\PaymentService;
use Illuminate\Http\Request;

class PaymentCallbackController extends Controller
{
    /**
     * Server-to-server (IPN) or browser-redirect endpoint a real gateway
     * would call. Public — a gateway can't carry a Sanctum bearer token.
     */
    public function handle(Request $request, PaymentService $payments): PaymentResource
    {
        return PaymentResource::make($payments->handleCallback($request->all()));
    }
}
