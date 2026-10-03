<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CatalogTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_can_list_categories(): void
    {
        Category::factory()->count(3)->create();

        $this->getJson('/api/categories')->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_guest_can_view_a_category_by_slug(): void
    {
        $category = Category::factory()->create(['name' => 'Electronics']);

        $this->getJson("/api/categories/{$category->slug}")
            ->assertOk()
            ->assertJsonPath('data.slug', 'electronics');
    }

    public function test_guest_can_list_only_active_products(): void
    {
        Product::factory()->count(2)->create(['is_active' => true]);
        Product::factory()->create(['is_active' => false]);

        $this->getJson('/api/products')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_products_can_be_filtered_by_category_slug(): void
    {
        $electronics = Category::factory()->create(['name' => 'Electronics']);
        $books = Category::factory()->create(['name' => 'Books']);
        Product::factory()->create(['category_id' => $electronics->id, 'is_active' => true]);
        Product::factory()->create(['category_id' => $books->id, 'is_active' => true]);

        $this->getJson('/api/products?category=electronics')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.category.slug', 'electronics');
    }

    public function test_products_can_be_searched_by_name(): void
    {
        Product::factory()->create(['name' => 'Wireless Mouse', 'is_active' => true]);
        Product::factory()->create(['name' => 'Desk Lamp', 'is_active' => true]);

        $this->getJson('/api/products?search=mouse')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Wireless Mouse');
    }

    public function test_guest_can_view_an_active_product_by_slug(): void
    {
        $product = Product::factory()->create(['name' => 'Wireless Mouse', 'is_active' => true]);

        $this->getJson("/api/products/{$product->slug}")
            ->assertOk()
            ->assertJsonPath('data.slug', 'wireless-mouse');
    }

    public function test_inactive_product_is_not_viewable(): void
    {
        $product = Product::factory()->create(['is_active' => false]);

        $this->getJson("/api/products/{$product->slug}")->assertNotFound();
    }
}
