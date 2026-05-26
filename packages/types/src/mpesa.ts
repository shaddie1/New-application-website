/** Daraja STK Push payloads. Shapes match Safaricom's docs verbatim. */

export interface MpesaStkRequest {
  BusinessShortCode: string;
  Password: string; // base64(shortcode + passkey + timestamp)
  Timestamp: string; // YYYYMMDDHHmmss
  TransactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  Amount: number; // whole KES
  PartyA: string; // payer MSISDN, 2547XXXXXXXX
  PartyB: string; // till / paybill
  PhoneNumber: string; // same as PartyA
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

export interface MpesaStkResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface MpesaStkCallbackItem {
  Name: string;
  Value?: string | number;
}

export interface MpesaStkCallback {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: { Item: MpesaStkCallbackItem[] };
    };
  };
}

/** UI-facing state machine (drives the STK overlay on mockup screen 16). */
export type MpesaUiState = 'IDLE' | 'REQUESTED' | 'AWAITING_PIN' | 'SUCCESS' | 'FAILED' | 'TIMED_OUT';

// ── Payment DTOs (shared between API and clients) ─────────────────────────

export type PaymentStatus =
  | 'PENDING'
  | 'REQUESTED'
  | 'AWAITING_USER'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type PaymentProvider = 'MPESA_STK' | 'WALLET_CREDIT';

export interface PaymentDto {
  id: string;
  bookingId: string | null;
  provider: PaymentProvider;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  failureReason: string | null;
  /** Last MSISDN we pushed to (E.164). Null until STK was actually fired. */
  msisdn: string | null;
  /** Daraja checkout request id (null until STK was fired). */
  checkoutRequestId: string | null;
  /** Receipt number once the user has paid. */
  mpesaReceiptNumber: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface InitiatePaymentInput {
  bookingId: string;
  /** Override MSISDN; defaults to the user's profile phone if omitted. */
  msisdn?: string;
}
