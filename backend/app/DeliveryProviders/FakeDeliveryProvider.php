<?php

namespace App\DeliveryProviders;

use App\Contracts\DeliveryProviderContract;
use App\Models\Order;
use Illuminate\Support\Str;

/**
 * Stands in for a real courier aggregator (e.g. CarryBee) until real
 * credentials are available. `verify()` has nothing to cryptographically
 * check in a fake world, so it just passes through whatever status it's
 * given.
 */
class FakeDeliveryProvider implements DeliveryProviderContract
{
    public function createShipment(Order $order): array
    {
        return [
            'tracking_id' => 'CARRYBEE-'.Str::uuid(),
        ];
    }

    public function verify(array $payload): array
    {
        return [
            'tracking_id' => $payload['tracking_id'],
            'valid' => true,
            'status' => $payload['status'],
        ];
    }
}
