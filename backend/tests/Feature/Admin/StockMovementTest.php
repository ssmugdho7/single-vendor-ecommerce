<?php

namespace Tests\Feature\Admin;

use App\Models\Product;
use App\Models\StockMovement;
use App\Models\User;
use App\StockMovementType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StockMovementTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_restock(): void
    {
        $product = Product::factory()->create();

        $this->postJson("/api/admin/products/{$product->id}/stock-movements", [
            'type' => 'restock',
            'quantity' => 10,
        ])->assertUnauthorized();
    }

    public function test_non_admin_cannot_restock(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => false]));
        $product = Product::factory()->create();

        $this->postJson("/api/admin/products/{$product->id}/stock-movements", [
            'type' => 'restock',
            'quantity' => 10,
        ])->assertForbidden();
    }

    public function test_admin_can_restock_a_product(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $product = Product::factory()->create(['stock_quantity' => 5]);

        $response = $this->postJson("/api/admin/products/{$product->id}/stock-movements", [
            'type' => 'restock',
            'quantity' => 10,
            'note' => 'New shipment',
        ]);

        $response->assertOk()->assertJsonPath('data.stock_quantity', 15);

        $this->assertDatabaseHas('stock_movements', [
            'product_id' => $product->id,
            'type' => StockMovementType::Restock,
            'quantity_change' => 10,
            'note' => 'New shipment',
        ]);
    }

    public function test_admin_can_correct_stock_to_an_exact_value(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $product = Product::factory()->create(['stock_quantity' => 20]);

        $response = $this->postJson("/api/admin/products/{$product->id}/stock-movements", [
            'type' => 'correction',
            'new_quantity' => 12,
        ]);

        $response->assertOk()->assertJsonPath('data.stock_quantity', 12);

        $this->assertDatabaseHas('stock_movements', [
            'product_id' => $product->id,
            'type' => StockMovementType::Correction,
            'quantity_change' => -8,
        ]);
    }

    public function test_restock_requires_a_quantity(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $product = Product::factory()->create();

        $this->postJson("/api/admin/products/{$product->id}/stock-movements", [
            'type' => 'restock',
        ])->assertUnprocessable()->assertJsonValidationErrors('quantity');
    }

    public function test_correction_requires_a_new_quantity(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $product = Product::factory()->create();

        $this->postJson("/api/admin/products/{$product->id}/stock-movements", [
            'type' => 'correction',
        ])->assertUnprocessable()->assertJsonValidationErrors('new_quantity');
    }

    public function test_admin_can_list_a_products_movement_history(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $product = Product::factory()->create();
        StockMovement::factory()->count(3)->create(['product_id' => $product->id]);

        $this->getJson("/api/admin/products/{$product->id}/stock-movements")
            ->assertOk()
            ->assertJsonCount(3, 'data');
    }
}
