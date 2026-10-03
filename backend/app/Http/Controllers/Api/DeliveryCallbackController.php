<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DeliveryResource;
use App\Services\DeliveryService;
use Illuminate\Http\Request;

class DeliveryCallbackController extends Controller
{
    /**
     * Webhook endpoint a real courier aggregator would call. Public —
     * a courier can't carry a Sanctum bearer token.
     */
    public function handle(Request $request, DeliveryService $deliveries): DeliveryResource
    {
        return DeliveryResource::make($deliveries->handleStatusUpdate($request->all()));
    }
}
