export interface InitializePaymentData {
  paymentMethod?: "paystack";
  bookingId: string;
  hubId?: string;
  slug?: string;
  // The frontend origin that made this request (from the Origin header) —
  // only honored if it's in the shared allowedOrigins list, so this can't be
  // used to redirect a real payment to an attacker-controlled URL.
  origin?: string;
}

export interface PaystackCreateResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

// 2. Verification Payload
export interface VerifyPaymentData {
  reference: string;
}

// Paystack Transaction Metadata
export interface PaystackMetadata {
  bookingId: string;
  customBookingId: string;
  hubId: string;
  userId?: string | null;
  paymentType?: "deposit" | "balance" | "full";
}

// Paystack Verify API Response Payload
export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    domain: string;
    status: "success" | "failed" | "abandoned";
    reference: string;
    amount: number;
    paid_at: string;
    channel: string;
    currency: string;
    metadata: PaystackMetadata;
    customer: {
      id: number;
      email: string;
      customer_code: string;
    };
  };
}
