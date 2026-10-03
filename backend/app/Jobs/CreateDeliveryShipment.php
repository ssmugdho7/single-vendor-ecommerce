<?php

namespace App\Jobs;

use App\Models\Order;
use App\Services\DeliveryService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class CreateDeliveryShipment implements ShouldQueue
{
    use Queueable;

    /**
     * Create a new job instance.
     */
    public function __construct(public Order $order)
    {
        //
    }

    /**
     * Execute the job.
     */
    public function handle(DeliveryService $deliveries): void
    {
        $deliveries->createShipment($this->order);
    }
}
