<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OrderTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_list_orders(): void
    {
        $this->getJson('/api/orders')->assertUnauthorized();
    }

    public function test_customer_can_list_only_their_own_orders(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        Order::factory()->count(2)->create(['user_id' => $user->id]);
        Order::factory()->create();

        $this->getJson('/api/orders')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_customer_can_view_their_own_order(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $order = Order::factory()->create(['user_id' => $user->id]);

        $this->getJson("/api/orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $order->id);
    }

    public function test_customer_cannot_view_another_users_order(): void
    {
        $order = Order::factory()->create();
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/orders/{$order->id}")->assertNotFound();
    }
}
