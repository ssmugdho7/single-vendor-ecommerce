<?php

namespace Tests\Feature;

use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use App\Models\User;
use App\StockMovementType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CheckoutTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, string>
     */
    private function validShippingPayload(): array
    {
        return [
            'recipient_name' => 'Jane Doe',
            'recipient_phone' => '+8801700000000',
            'shipping_address' => '123 Main Street, Dhaka',
        ];
    }

    public function test_guest_cannot_checkout(): void
    {
        $this->postJson('/api/checkout')->assertUnauthorized();
    }

    public function test_checking_out_with_an_empty_cart_is_rejected(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/checkout', $this->validShippingPayload())->assertUnprocessable();
    }

    public function test_checkout_requires_shipping_details(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/checkout', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['recipient_name', 'recipient_phone', 'shipping_address']);
    }

    public function test_checkout_creates_an_order_and_decrements_stock(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $cart = Cart::forUser($user);
        $product = Product::factory()->create(['price' => 25, 'stock_quantity' => 10]);
        CartItem::factory()->create(['cart_id' => $cart->id, 'product_id' => $product->id, 'quantity' => 3]);

        $response = $this->postJson('/api/checkout', $this->validShippingPayload());

        $response->assertCreated()
            ->assertJsonPath('data.status', 'pending_payment')
            ->assertJsonPath('data.total_amount', 75)
            ->assertJsonPath('data.recipient_name', 'Jane Doe');

        $this->assertDatabaseHas('products', ['id' => $product->id, 'stock_quantity' => 7]);
        $this->assertDatabaseCount('cart_items', 0);
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseHas('stock_movements', [
            'product_id' => $product->id,
            'type' => StockMovementType::Sale,
            'quantity_change' => -3,
        ]);
    }

    public function test_checkout_rejects_insufficient_stock_without_creating_an_order(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);
        $cart = Cart::forUser($user);
        $product = Product::factory()->create(['stock_quantity' => 2]);
        CartItem::factory()->create(['cart_id' => $cart->id, 'product_id' => $product->id, 'quantity' => 5]);

        $this->postJson('/api/checkout', $this->validShippingPayload())->assertUnprocessable();

        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseHas('products', ['id' => $product->id, 'stock_quantity' => 2]);
        $this->assertDatabaseCount('cart_items', 1);
    }
}
