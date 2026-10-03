<?php

namespace Tests\Feature;

use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CartTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_access_cart(): void
    {
        $this->getJson('/api/cart')->assertUnauthorized();
    }

    public function test_customer_can_view_an_empty_cart(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/cart')
            ->assertOk()
            ->assertJsonPath('data.items', [])
            ->assertJsonPath('data.total', 0);
    }

    public function test_customer_can_add_an_item_to_the_cart(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $product = Product::factory()->create(['price' => 10, 'stock_quantity' => 5, 'is_active' => true]);

        $this->postJson('/api/cart/items', ['product_id' => $product->id, 'quantity' => 2])
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.total', 20);
    }

    public function test_adding_the_same_product_again_increments_quantity(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $product = Product::factory()->create(['price' => 10, 'stock_quantity' => 5, 'is_active' => true]);

        $this->postJson('/api/cart/items', ['product_id' => $product->id, 'quantity' => 2]);
        $this->postJson('/api/cart/items', ['product_id' => $product->id, 'quantity' => 3])
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.quantity', 5);
    }

    public function test_cannot_add_an_inactive_product(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $product = Product::factory()->create(['is_active' => false]);

        $this->postJson('/api/cart/items', ['product_id' => $product->id, 'quantity' => 1])
            ->assertStatus(422);
    }

    public function test_customer_can_update_their_own_cart_item_quantity(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $cart = Cart::forUser($user);
        $item = CartItem::factory()->create(['cart_id' => $cart->id, 'quantity' => 1]);

        $this->patchJson("/api/cart/items/{$item->id}", ['quantity' => 4])
            ->assertOk()
            ->assertJsonPath('data.items.0.quantity', 4);
    }

    public function test_customer_cannot_update_another_users_cart_item(): void
    {
        $owner = User::factory()->create();
        $cart = Cart::forUser($owner);
        $item = CartItem::factory()->create(['cart_id' => $cart->id]);

        Sanctum::actingAs(User::factory()->create());

        $this->patchJson("/api/cart/items/{$item->id}", ['quantity' => 4])->assertNotFound();
    }

    public function test_customer_can_remove_their_own_cart_item(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $cart = Cart::forUser($user);
        $item = CartItem::factory()->create(['cart_id' => $cart->id]);

        $this->deleteJson("/api/cart/items/{$item->id}")
            ->assertOk()
            ->assertJsonCount(0, 'data.items');

        $this->assertDatabaseMissing('cart_items', ['id' => $item->id]);
    }
}
