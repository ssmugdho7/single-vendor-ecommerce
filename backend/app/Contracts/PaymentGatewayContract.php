<?php

namespace App\Contracts;

use App\Models\Order;

interface PaymentGatewayContract
{
    /**
     * @return array{transaction_id: string, gateway_url: string}
     */
    public function initiate(Order $order): array;

    /**
     * @param  array<string, mixed>  $payload
     * @return array{transaction_id: string, valid: bool, status: string}
     */
    public function verify(array $payload): array;
}
