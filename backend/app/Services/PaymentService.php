<?php

namespace App\Services;

use App\Contracts\PaymentGatewayContract;
use App\Jobs\SendOrderConfirmation;
use App\Models\Order;
use App\Models\Payment;
use App\PaymentStatus;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PaymentService
{
    public function __construct(private PaymentGatewayContract $gateway) {}

    /**
     * @return array{payment: Payment, gateway_url: string}
     */
    public function initiate(Order $order): array
    {
        if ($order->status !== 'pending_payment') {
            throw ValidationException::withMessages([
                'order' => ['Only a pending order can be paid for.'],
            ]);
        }

        $initiation = $this->gateway->initiate($order);

        $payment = $order->payments()->create([
            'gateway' => config('services.payment.driver'),
            'transaction_id' => $initiation['transaction_id'],
            'amount' => $order->total_amount,
            'status' => PaymentStatus::Pending,
        ]);

        return ['payment' => $payment, 'gateway_url' => $initiation['gateway_url']];
    }

    public function handleCallback(array $payload): Payment
    {
        $result = $this->gateway->verify($payload);

        $payment = Payment::where('transaction_id', $result['transaction_id'])->firstOrFail();

        return DB::transaction(function () use ($payment, $result) {
            $payment = Payment::query()->lockForUpdate()->findOrFail($payment->id);

            // A duplicate IPN/redirect for an already-resolved payment is a no-op.
            if ($payment->status !== PaymentStatus::Pending) {
                return $payment;
            }

            $status = $result['valid'] && $result['status'] === 'success'
                ? PaymentStatus::Success
                : PaymentStatus::Failed;

            $payment->update([
                'status' => $status,
                'raw_response' => $result,
            ]);

            if ($status === PaymentStatus::Success) {
                $payment->order->update(['status' => 'paid']);

                SendOrderConfirmation::dispatch($payment->order);
            }

            return $payment;
        });
    }
}
