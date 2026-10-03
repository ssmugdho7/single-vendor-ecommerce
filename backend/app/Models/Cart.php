<?php

namespace App\Models;

use Database\Factories\CartFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Cart extends Model
{
    /** @use HasFactory<CartFactory> */
    use HasFactory;

    /**
     * @var array<int, string>
     */
    protected $fillable = ['user_id'];

    public static function forUser(User $user): self
    {
        $cart = self::query()->firstOrCreate(['user_id' => $user->id]);

        // Lazily creating the cart row is an implementation detail, not
        // something callers asked for — don't let it leak into API
        // responses as a 201 (JsonResource auto-201s on wasRecentlyCreated).
        $cart->wasRecentlyCreated = false;

        return $cart;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(CartItem::class);
    }
}
