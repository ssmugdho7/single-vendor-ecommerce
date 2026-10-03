<?php

namespace Database\Factories;

use App\Models\Order;
use App\Models\Payment;
use App\PaymentStatus;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Payment>
 */
class PaymentFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'order_id' => Order::factory(),
            'gateway' => 'fake',
            'transaction_id' => 'FAKE-'.Str::uuid(),
            'amount' => fake()->randomFloat(2, 10, 1000),
            'status' => PaymentStatus::Pending,
        ];
    }
}
