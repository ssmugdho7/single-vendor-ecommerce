<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class CategorySeeder extends Seeder
{
    /**
     * @var array<int, string>
     */
    private const NAMES = [
        'Electronics',
        'Home & Kitchen',
        'Clothing & Apparel',
        'Books',
        'Sports & Outdoors',
        'Toys & Games',
        'Beauty & Personal Care',
        'Office Supplies',
    ];

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        foreach (self::NAMES as $name) {
            Category::create([
                'name' => $name,
                'slug' => Str::slug($name),
            ]);
        }
    }
}
