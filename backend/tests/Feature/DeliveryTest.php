<?php

namespace Tests\Feature;

use App\Jobs\CreateDeliveryShipment;
use App\Models\Order;
use App\Models\Payment;
use App\Services\DeliveryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class DeliveryTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_successful_payment_dispatches_a_shipment_job(): void
    {
        Queue::fake();

        $order = Order::factory()->create(['status' => 'pending_payment']);
        $payment = Payment::factory()->create(['order_id' => $order->id, 'status' => 'pending']);

        $this->postJson("/api/payments/fake/{$payment->transaction_id}/pay")->assertOk();

        Queue::assertPushed(CreateDeliveryShipment::class, 1);
    }

    public function test_running_the_job_creates_a_shipment_and_marks_the_order_shipped(): void
    {
        $order = Order::factory()->create(['status' => 'paid']);

        (new CreateDeliveryShipment($order))->handle(app(DeliveryService::class));

        $this->assertDatabaseHas('deliveries', [
            'order_id' => $order->id,
            'provider' => 'fake',
            'status' => 'pickup_pending',
        ]);
        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'shipped']);
    }

    public function test_running_the_job_twice_does_not_create_a_duplicate_shipment(): void
    {
        $order = Order::factory()->create(['status' => 'paid']);

        (new CreateDeliveryShipment($order))->handle(app(DeliveryService::class));
        (new CreateDeliveryShipment($order))->handle(app(DeliveryService::class));

        $this->assertDatabaseCount('deliveries', 1);
    }
}
