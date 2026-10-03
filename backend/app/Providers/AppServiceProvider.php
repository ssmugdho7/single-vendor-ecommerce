<?php

namespace App\Providers;

use App\Contracts\DeliveryProviderContract;
use App\Contracts\PaymentGatewayContract;
use App\DeliveryProviders\FakeDeliveryProvider;
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

        $this->app->bind(DeliveryProviderContract::class, match (config('services.delivery.driver')) {
            default => FakeDeliveryProvider::class,
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
