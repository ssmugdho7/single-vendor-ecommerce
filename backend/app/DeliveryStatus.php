<?php

namespace App;

enum DeliveryStatus: string
{
    case PickupPending = 'pickup_pending';
    case InTransit = 'in_transit';
    case Delivered = 'delivered';
    case Failed = 'failed';
}
