<?php

namespace Tests\Feature\Admin;

use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProductTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_access_products(): void
    {
        $this->getJson('/api/admin/products')->assertUnauthorized();
    }

    public function test_non_admin_cannot_access_products(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => false]));

        $this->getJson('/api/admin/products')->assertForbidden();
    }

    public function test_admin_can_list_products_with_category(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        Product::factory()->count(3)->create();

        $this->getJson('/api/admin/products')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonStructure(['data' => [['id', 'category', 'name', 'slug', 'price', 'stock_quantity']]]);
    }

    public function test_admin_can_create_product(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $category = Category::factory()->create();

        $response = $this->postJson('/api/admin/products', [
            'category_id' => $category->id,
            'name' => 'Wireless Mouse',
            'price' => 29.99,
            'stock_quantity' => 50,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Wireless Mouse')
            ->assertJsonPath('data.slug', 'wireless-mouse')
            ->assertJsonPath('data.category_id', $category->id);

        $this->assertDatabaseHas('products', ['slug' => 'wireless-mouse', 'category_id' => $category->id]);
    }

    public function test_creating_product_requires_a_valid_category(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));

        $this->postJson('/api/admin/products', [
            'category_id' => 999,
            'name' => 'Ghost Product',
            'price' => 10,
            'stock_quantity' => 1,
        ])->assertUnprocessable()->assertJsonValidationErrors('category_id');
    }

    public function test_admin_can_update_product(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $product = Product::factory()->create(['price' => 10]);

        $this->putJson("/api/admin/products/{$product->id}", [
            'price' => 15.50,
        ])->assertOk()->assertJsonPath('data.price', 15.5);

        $this->assertDatabaseHas('products', ['id' => $product->id, 'price' => 15.50]);
    }

    public function test_admin_can_delete_product(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $product = Product::factory()->create();

        $this->deleteJson("/api/admin/products/{$product->id}")->assertNoContent();

        $this->assertDatabaseMissing('products', ['id' => $product->id]);
    }
}
