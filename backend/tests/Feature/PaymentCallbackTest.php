<?php

namespace Tests\Feature;

use App\Jobs\SendOrderConfirmation;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PaymentCallbackTest extends TestCase
{
    use RefreshDatabase;

    public function test_fake_pay_marks_payment_successful_and_order_paid(): void
    {
        Queue::fake();

        $order = Order::factory()->create(['status' => 'pending_payment']);
        $payment = Payment::factory()->create(['order_id' => $order->id, 'status' => 'pending']);

        $response = $this->postJson("/api/payments/fake/{$payment->transaction_id}/pay");

        $response->assertOk()->assertJsonPath('data.status', 'success');

        $this->assertDatabaseHas('payments', ['id' => $payment->id, 'status' => 'success']);
        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'paid']);
        Queue::assertPushed(SendOrderConfirmation::class, 1);
    }

    public function test_fake_cancel_marks_payment_failed_and_order_stays_pending(): void
    {
        Queue::fake();

        $order = Order::factory()->create(['status' => 'pending_payment']);
        $payment = Payment::factory()->create(['order_id' => $order->id, 'status' => 'pending']);

        $response = $this->postJson("/api/payments/fake/{$payment->transaction_id}/cancel");

        $response->assertOk()->assertJsonPath('data.status', 'failed');

        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'pending_payment']);
        Queue::assertNotPushed(SendOrderConfirmation::class);
    }

    public function test_a_duplicate_callback_for_the_same_transaction_is_a_no_op(): void
    {
        Queue::fake();

        $order = Order::factory()->create(['status' => 'pending_payment']);
        $payment = Payment::factory()->create(['order_id' => $order->id, 'status' => 'pending']);

        $this->postJson("/api/payments/fake/{$payment->transaction_id}/pay")->assertOk();
        $this->postJson("/api/payments/fake/{$payment->transaction_id}/cancel")->assertOk();

        // The second call (cancel) is a no-op because the payment already resolved.
        $this->assertDatabaseHas('payments', ['id' => $payment->id, 'status' => 'success']);
        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'paid']);
        Queue::assertPushed(SendOrderConfirmation::class, 1);
    }

    public function test_unknown_transaction_returns_not_found(): void
    {
        $this->postJson('/api/payments/fake/does-not-exist/pay')->assertNotFound();
    }
}
