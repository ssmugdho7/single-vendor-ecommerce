<?php

namespace App\Services;

use App\Contracts\DeliveryProviderContract;
use App\DeliveryStatus;
use App\Models\Delivery;
use App\Models\Order;
use Illuminate\Support\Facades\DB;

class DeliveryService
{
    public function __construct(private DeliveryProviderContract $provider) {}

    public function createShipment(Order $order): Delivery
    {
        // Query fresh rather than trusting `$order->delivery` — a retried
        // job may reuse the same in-memory Order instance, whose cached
        // relation would still be stale from before this method's first
        // (successful) run.
        $existing = Delivery::where('order_id', $order->id)->first();

        if ($existing) {
            return $existing;
        }

        $shipment = $this->provider->createShipment($order);

        $delivery = Delivery::create([
            'order_id' => $order->id,
            'provider' => config('services.delivery.driver'),
            'tracking_id' => $shipment['tracking_id'],
            'status' => DeliveryStatus::PickupPending,
        ]);

        $order->update(['status' => 'shipped']);

        return $delivery;
    }

    public function handleStatusUpdate(array $payload): Delivery
    {
        $result = $this->provider->verify($payload);

        $delivery = Delivery::where('tracking_id', $result['tracking_id'])->firstOrFail();

        return DB::transaction(function () use ($delivery, $result) {
            $delivery = Delivery::query()->lockForUpdate()->findOrFail($delivery->id);

            // A duplicate webhook after a terminal state is a no-op.
            if (in_array($delivery->status, [DeliveryStatus::Delivered, DeliveryStatus::Failed], true)) {
                return $delivery;
            }

            $status = $result['valid'] ? DeliveryStatus::from($result['status']) : DeliveryStatus::Failed;

            $delivery->update([
                'status' => $status,
                'raw_response' => $result,
            ]);

            if ($status === DeliveryStatus::Delivered) {
                $delivery->order->update(['status' => 'delivered']);
            } elseif ($status === DeliveryStatus::Failed) {
                $delivery->order->update(['status' => 'delivery_failed']);
            }

            return $delivery;
        });
    }
}
