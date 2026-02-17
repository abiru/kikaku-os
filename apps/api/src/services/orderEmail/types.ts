export type OrderWithCustomer = {
  id: number;
  status: string;
  total_net: number;
  currency: string;
  created_at: string;
  customer_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  metadata: string | null;
};

export type OrderItem = {
  product_title: string;
  variant_title: string;
  quantity: number;
  unit_price: number;
};

export type ShippingAddress = {
  name?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  phone?: string;
};
