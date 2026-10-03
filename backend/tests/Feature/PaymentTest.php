<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PaymentTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_initiate_payment(): void
    {
        $order = Order::factory()->create();

        $this->postJson("/api/orders/{$order->id}/pay")->assertUnauthorized();
    }

    public function test_owner_can_initiate_payment_for_a_pending_order(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $order = Order::factory()->create(['user_id' => $user->id, 'status' => 'pending_payment']);

        $response = $this->postJson("/api/orders/{$order->id}/pay");

        $response->assertCreated()
            ->assertJsonPath('payment.status', 'pending')
            ->assertJsonStructure(['payment', 'gateway_url']);

        $this->assertDatabaseHas('payments', ['order_id' => $order->id, 'status' => 'pending']);
    }

    public function test_customer_cannot_pay_for_another_users_order(): void
    {
        $order = Order::factory()->create();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/orders/{$order->id}/pay")->assertNotFound();
    }

    public function test_cannot_pay_for_an_already_paid_order(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $order = Order::factory()->create(['user_id' => $user->id, 'status' => 'paid']);

        $this->postJson("/api/orders/{$order->id}/pay")->assertUnprocessable();
    }

    public function test_cannot_pay_for_a_cancelled_order(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $order = Order::factory()->create(['user_id' => $user->id, 'status' => 'cancelled']);

        $this->postJson("/api/orders/{$order->id}/pay")->assertUnprocessable();
    }
}
