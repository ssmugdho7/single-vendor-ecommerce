<?php

namespace App\PaymentGateways;

use App\Contracts\PaymentGatewayContract;
use App\Models\Order;
use Illuminate\Support\Str;

/**
 * Stands in for a real hosted-checkout gateway (e.g. SSLCommerz) until
 * real credentials are available. `initiate()` points the customer at
 * this app's own `/api/payments/fake/{transaction}` simulation
 * endpoints instead of an external gateway page; `verify()` has nothing
 * to cryptographically check in a fake world, so it just passes through
 * whatever status it's given.
 */
class FakePaymentGateway implements PaymentGatewayContract
{
    public function initiate(Order $order): array
    {
        $transactionId = 'FAKE-'.Str::uuid();

        return [
            'transaction_id' => $transactionId,
            'gateway_url' => url("/api/payments/fake/{$transactionId}"),
        ];
    }

    public function verify(array $payload): array
    {
        return [
            'transaction_id' => $payload['transaction_id'],
            'valid' => true,
            'status' => $payload['status'],
        ];
    }
}
