<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DeliveryResource;
use App\Services\DeliveryService;

class FakeDeliveryController extends Controller
{
    /**
     * Stands in for CarryBee's webhook reporting the shipment is on its way.
     */
    public function transit(string $tracking, DeliveryService $deliveries): DeliveryResource
    {
        return DeliveryResource::make($deliveries->handleStatusUpdate([
            'tracking_id' => $tracking,
            'status' => 'in_transit',
        ]));
    }

    /**
     * Stands in for CarryBee's webhook reporting a successful delivery.
     */
    public function deliver(string $tracking, DeliveryService $deliveries): DeliveryResource
    {
        return DeliveryResource::make($deliveries->handleStatusUpdate([
            'tracking_id' => $tracking,
            'status' => 'delivered',
        ]));
    }

    /**
     * Stands in for CarryBee's webhook reporting a failed delivery attempt.
     */
    public function fail(string $tracking, DeliveryService $deliveries): DeliveryResource
    {
        return DeliveryResource::make($deliveries->handleStatusUpdate([
            'tracking_id' => $tracking,
            'status' => 'failed',
        ]));
    }
}
