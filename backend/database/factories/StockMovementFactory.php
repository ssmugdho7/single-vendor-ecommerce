<?php

namespace Database\Factories;

use App\Models\Product;
use App\Models\StockMovement;
use App\StockMovementType;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<StockMovement>
 */
class StockMovementFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'product_id' => Product::factory(),
            'type' => StockMovementType::Restock,
            'quantity_change' => fake()->numberBetween(1, 50),
            'note' => null,
        ];
    }
}
