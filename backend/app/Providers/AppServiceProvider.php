<?php

namespace App\Providers;

use App\Contracts\PaymentGatewayContract;
use App\PaymentGateways\FakePaymentGateway;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(PaymentGatewayContract::class, match (config('services.payment.driver')) {
            default => FakePaymentGateway::class,
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
