<?php

namespace Tests\Feature\Admin;

use App\Models\Category;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CategoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_access_categories(): void
    {
        $this->getJson('/api/admin/categories')->assertUnauthorized();
    }

    public function test_non_admin_cannot_access_categories(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => false]));

        $this->getJson('/api/admin/categories')->assertForbidden();
    }

    public function test_admin_can_list_categories(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        Category::factory()->count(3)->create();

        $this->getJson('/api/admin/categories')
            ->assertOk()
            ->assertJsonCount(3, 'data');
    }

    public function test_admin_can_create_category_with_generated_slug(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));

        $response = $this->postJson('/api/admin/categories', [
            'name' => 'Outdoor Gear',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Outdoor Gear')
            ->assertJsonPath('data.slug', 'outdoor-gear');

        $this->assertDatabaseHas('categories', ['slug' => 'outdoor-gear']);
    }

    public function test_admin_can_update_category(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $category = Category::factory()->create(['name' => 'Old Name']);

        $this->putJson("/api/admin/categories/{$category->id}", [
            'name' => 'New Name',
        ])->assertOk()->assertJsonPath('data.name', 'New Name');

        $this->assertDatabaseHas('categories', ['id' => $category->id, 'name' => 'New Name']);
    }

    public function test_admin_can_delete_category(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));
        $category = Category::factory()->create();

        $this->deleteJson("/api/admin/categories/{$category->id}")->assertNoContent();

        $this->assertDatabaseMissing('categories', ['id' => $category->id]);
    }

    public function test_creating_category_requires_name(): void
    {
        Sanctum::actingAs(User::factory()->create(['is_admin' => true]));

        $this->postJson('/api/admin/categories', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');
    }
}
