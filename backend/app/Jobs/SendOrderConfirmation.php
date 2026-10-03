<?php

namespace App\Jobs;

use App\Models\Order;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class SendOrderConfirmation implements ShouldQueue
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
    public function handle(): void
    {
        // Stands in for a real notification (email/SMS) until a mail
        // provider is configured — this still exercises the real Redis
        // queue end-to-end.
        Log::info("Order #{$this->order->id} confirmed for user #{$this->order->user_id}.");
    }
}
