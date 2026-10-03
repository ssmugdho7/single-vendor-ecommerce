<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PaymentResource;
use App\Services\PaymentService;

class FakePaymentController extends Controller
{
    /**
     * Stands in for a customer completing payment on a real gateway's
     * hosted checkout page.
     */
    public function pay(string $transaction, PaymentService $payments): PaymentResource
    {
        return PaymentResource::make($payments->handleCallback([
            'transaction_id' => $transaction,
            'status' => 'success',
        ]));
    }

    /**
     * Stands in for a customer abandoning/cancelling on the gateway's page.
     */
    public function cancel(string $transaction, PaymentService $payments): PaymentResource
    {
        return PaymentResource::make($payments->handleCallback([
            'transaction_id' => $transaction,
            'status' => 'failed',
        ]));
    }
}
