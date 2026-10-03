<?php

namespace Database\Factories;

use App\DeliveryStatus;
use App\Models\Delivery;
use App\Models\Order;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Delivery>
 */
class DeliveryFactory extends Factory
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
            'provider' => 'fake',
            'tracking_id' => 'CARRYBEE-'.Str::uuid(),
            'status' => DeliveryStatus::PickupPending,
        ];
    }
}
