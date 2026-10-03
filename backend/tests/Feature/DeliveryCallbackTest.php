<?php

namespace Tests\Feature;

use App\Models\Delivery;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeliveryCallbackTest extends TestCase
{
    use RefreshDatabase;

    public function test_fake_transit_updates_delivery_only_and_leaves_order_shipped(): void
    {
        $order = Order::factory()->create(['status' => 'shipped']);
        $delivery = Delivery::factory()->create(['order_id' => $order->id, 'status' => 'pickup_pending']);

        $response = $this->postJson("/api/deliveries/fake/{$delivery->tracking_id}/transit");

        $response->assertOk()->assertJsonPath('data.status', 'in_transit');

        $this->assertDatabaseHas('deliveries', ['id' => $delivery->id, 'status' => 'in_transit']);
        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'shipped']);
    }

    public function test_fake_deliver_marks_order_delivered(): void
    {
        $order = Order::factory()->create(['status' => 'shipped']);
        $delivery = Delivery::factory()->create(['order_id' => $order->id, 'status' => 'in_transit']);

        $response = $this->postJson("/api/deliveries/fake/{$delivery->tracking_id}/deliver");

        $response->assertOk()->assertJsonPath('data.status', 'delivered');

        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'delivered']);
    }

    public function test_fake_fail_marks_order_delivery_failed(): void
    {
        $order = Order::factory()->create(['status' => 'shipped']);
        $delivery = Delivery::factory()->create(['order_id' => $order->id, 'status' => 'in_transit']);

        $response = $this->postJson("/api/deliveries/fake/{$delivery->tracking_id}/fail");

        $response->assertOk()->assertJsonPath('data.status', 'failed');

        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'delivery_failed']);
    }

    public function test_a_callback_after_a_terminal_state_is_a_no_op(): void
    {
        $order = Order::factory()->create(['status' => 'delivered']);
        $delivery = Delivery::factory()->create(['order_id' => $order->id, 'status' => 'delivered']);

        $this->postJson("/api/deliveries/fake/{$delivery->tracking_id}/fail")->assertOk();

        $this->assertDatabaseHas('deliveries', ['id' => $delivery->id, 'status' => 'delivered']);
        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'delivered']);
    }

    public function test_unknown_tracking_id_returns_not_found(): void
    {
        $this->postJson('/api/deliveries/fake/does-not-exist/deliver')->assertNotFound();
    }
}
