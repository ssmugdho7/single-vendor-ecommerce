export interface Paginated<T> {
  data: T[];
  links: {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
  };
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface User {
  id: number;
  name: string;
  email: string;
  is_admin: boolean;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  category_id: number;
  category?: Category;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  is_active: boolean;
  image_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: number;
  type: "sale" | "restock" | "correction" | "cancellation";
  quantity_change: number;
  order_id: number | null;
  note: string | null;
  created_at: string;
}

export interface CartItem {
  id: number;
  product: Product;
  quantity: number;
  line_total: number;
}

export interface Cart {
  id: number;
  items: CartItem[];
  total: number;
}

export interface OrderItem {
  id: number;
  product: Product | null;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "cancelled"
  | "shipped"
  | "delivered"
  | "delivery_failed";

export interface Payment {
  id: number;
  gateway: string;
  transaction_id: string;
  status: "pending" | "success" | "failed";
  amount: number;
  created_at: string;
}

export interface Delivery {
  id: number;
  provider: string;
  tracking_id: string;
  status: "pickup_pending" | "in_transit" | "delivered" | "failed";
  created_at: string;
}

export interface Order {
  id: number;
  status: OrderStatus;
  total_amount: number;
  recipient_name: string;
  recipient_phone: string;
  shipping_address: string;
  user?: {
    id: number;
    name: string;
    email: string;
  };
  items: OrderItem[];
  payments: Payment[];
  delivery: Delivery | null;
  created_at: string;
}
