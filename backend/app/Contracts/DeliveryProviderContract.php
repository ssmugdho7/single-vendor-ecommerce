<?php

namespace App\Contracts;

use App\Models\Order;

interface DeliveryProviderContract
{
    /**
     * @return array{tracking_id: string}
     */
    public function createShipment(Order $order): array;

    /**
     * @param  array<string, mixed>  $payload
     * @return array{tracking_id: string, valid: bool, status: string}
     */
    public function verify(array $payload): array;
}
