<?php

namespace Tests\Feature\Admin;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\User;
use App\StockMovementType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OrderTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_list_orders(): void
    {
        $this->getJson('/api/admin/orders')->assertUnauthorized();
    }

    public function test_non_admin_cannot_list_orders(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => false]));

        $this->getJson('/api/admin/orders')->assertForbidden();
    }

    public function test_admin_can_list_all_orders_regardless_of_owner(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        Order::factory()->count(3)->create();

        $this->getJson('/api/admin/orders')->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_admin_can_view_any_order_with_the_customer_attached(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $customer = User::factory()->create(['name' => 'Jane Doe']);
        $order = Order::factory()->create(['user_id' => $customer->id]);

        $this->getJson("/api/admin/orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('data.user.name', 'Jane Doe');
    }

    public function test_admin_can_cancel_a_pending_order_and_stock_is_restored(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $product = Product::factory()->create(['stock_quantity' => 5]);
        $order = Order::factory()->create(['status' => 'pending_payment']);
        OrderItem::factory()->create([
            'order_id' => $order->id,
            'product_id' => $product->id,
            'quantity' => 3,
        ]);

        $response = $this->patchJson("/api/admin/orders/{$order->id}/cancel");

        $response->assertOk()->assertJsonPath('data.status', 'cancelled');

        $this->assertDatabaseHas('products', ['id' => $product->id, 'stock_quantity' => 8]);
        $this->assertDatabaseHas('stock_movements', [
            'product_id' => $product->id,
            'order_id' => $order->id,
            'type' => StockMovementType::Cancellation,
            'quantity_change' => 3,
        ]);
    }

    public function test_cancelling_an_already_cancelled_order_is_rejected(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $order = Order::factory()->create(['status' => 'cancelled']);

        $this->patchJson("/api/admin/orders/{$order->id}/cancel")->assertUnprocessable();
    }

    public function test_guest_cannot_cancel_an_order(): void
    {
        $order = Order::factory()->create();

        $this->patchJson("/api/admin/orders/{$order->id}/cancel")->assertUnauthorized();
    }
}
