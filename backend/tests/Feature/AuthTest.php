<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_register(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'password123',
        ]);

        $response->assertCreated()
            ->assertJsonStructure(['user', 'token']);

        $this->assertDatabaseHas('users', ['email' => 'jane@example.com', 'is_admin' => false]);
    }

    public function test_registration_requires_a_unique_email(): void
    {
        User::factory()->create(['email' => 'jane@example.com']);

        $this->postJson('/api/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'password123',
        ])->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_customer_can_login(): void
    {
        User::factory()->create([
            'email' => 'jane@example.com',
            'password' => 'password123',
        ]);

        $this->postJson('/api/login', [
            'email' => 'jane@example.com',
            'password' => 'password123',
        ])->assertOk()->assertJsonStructure(['user', 'token']);
    }

    public function test_login_fails_with_wrong_password(): void
    {
        User::factory()->create([
            'email' => 'jane@example.com',
            'password' => 'password123',
        ]);

        $this->postJson('/api/login', [
            'email' => 'jane@example.com',
            'password' => 'wrong',
        ])->assertUnprocessable();
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_logout_revokes_the_token(): void
    {
        User::factory()->create([
            'email' => 'jane@example.com',
            'password' => 'password123',
        ]);

        $token = $this->postJson('/api/login', [
            'email' => 'jane@example.com',
            'password' => 'password123',
        ])->json('token');

        $this->withToken($token)->postJson('/api/logout')->assertOk();

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }
}
