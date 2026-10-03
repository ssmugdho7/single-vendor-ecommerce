<?php

namespace App;

enum StockMovementType: string
{
    case Sale = 'sale';
    case Restock = 'restock';
    case Correction = 'correction';
    case Cancellation = 'cancellation';
}
