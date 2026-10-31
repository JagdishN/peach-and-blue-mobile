import { apiRequest } from './client';

export type InternalStatus =
  | 'picked_up'
  | 'washing'
  | 'ironing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface OrderItem {
  id: string;
  garmentId: string;
  itemName: string;
  // Off the linked GarmentCatalogue row, not OrderItem itself — lets the
  // Order Status screen show a service-aware delivery estimate (Dry
  // Clean/Wash & Fold takes longer than Ironing).
  serviceType: string;
  quantity: number | null;
  unitPrice: string | null;
  weightKg: string | null;
  pricePerKg: string | null;
  lineTotal: string;
}

export type PaymentMethod = 'cash' | 'upi' | 'net_banking' | 'credit_card';

export interface OrderCustomer {
  id: string;
  fullName: string;
  phoneNumber: string;
  locationLabel: string;
  branchId: string;
  // Staff can see this (unlike discountPercent/discountEnabled) — CLAUDE.md
  // "Monthly billing + discount": needed to know whether a delivery expects
  // a per-order payment (daily) or posts to the ledger instead (monthly_billing).
  billingMode: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  internalStatus: InternalStatus;
  pickupDate: string;
  deliveryDate: string | null;
  estimatedAmount: string;
  finalAmount: string;
  amountWasRevised: boolean;
  paymentStatus: string;
  paymentMethod: PaymentMethod | null;
  // Snapshot of the customer's billingMode at the moment this order was
  // created (CLAUDE.md "Monthly billing retroactivity — RESOLVED") — use
  // THIS, not customer.billingMode, to decide whether this specific order
  // needs a payment method at delivery. A customer's billing mode can
  // change after an order exists; this field intentionally doesn't.
  billingMode: string;
  staffId: string | null;
  customer: OrderCustomer;
  orderItems: OrderItem[];
}

export interface CreateOrderInput {
  customerName: string;
  customerPhoneNumber: string;
  locationLabel: string;
  branchId: string;
  pickupDate: string;
  items: { garmentId: string; quantity?: number; weightKg?: number; chosenPrice?: number }[];
}

export const createOrder = (input: CreateOrderInput) =>
  apiRequest<{ order: Order }>('/api/v1/orders', { method: 'POST', body: input }).then((res) => res.order);

export const listOrders = (params?: { date?: string; branchId?: string }) => {
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.branchId) query.set('branchId', params.branchId);
  const qs = query.toString();

  return apiRequest<{ orders: Order[] }>(`/api/v1/orders${qs ? `?${qs}` : ''}`).then((res) => res.orders);
};

export const getOrder = (id: string) => apiRequest<{ order: Order }>(`/api/v1/orders/${id}`).then((res) => res.order);

export const updateOrderStatus = (id: string, status: InternalStatus) =>
  apiRequest<{ order: Order }>(`/api/v1/orders/${id}/status`, { method: 'PATCH', body: { status } }).then(
    (res) => res.order
  );

// Payment-safety review (2026-10-30): outstanding/collected/allocated, in
// rupees (the backend converts from its internal paise representation
// before responding — mobile never deals with paise directly).
export interface InvoicePaymentSummary {
  required?: number;
  outstanding: number;
  collected: number;
  allocated: number;
  status: 'unpaid' | 'partially_paid' | 'paid';
  byMethod?: Record<string, number>;
}

export const fetchInvoicePaymentSummary = (orderId: string) =>
  apiRequest<{ paymentSummary: InvoicePaymentSummary }>(`/api/v1/orders/${orderId}/payment-summary`).then(
    (res) => res.paymentSummary
  );

// Lightweight, client-generated, not cryptographically meaningful — just
// needs to be unique per Record Payment attempt so a double-tap (or a
// retried request after a dropped response) sends the SAME key twice,
// which the backend recognizes and treats as a no-op rather than a second
// real receipt. Not a real UUID library on purpose — nothing here needs
// that level of rigor, just uniqueness.
export const generateIdempotencyKey = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

// CLAUDE.md "Payment marking — real gap" — bundled into the same delivery
// action as updateOrderStatus(id, 'delivered'), not a separate screen.
// REWORKED (2026-10-30, payment-safety review section 6/12): now supports a
// partial `amount` (omit to pay the full outstanding balance, preserving
// the old one-tap UX) and requires an `idempotencyKey` so a double-tap
// can't create a second real receipt. Response now also carries the
// updated paymentSummary and an `overpayment` flag.
// Payment collection / customer advances rework (2026-10-31) — both
// optional and only meaningful together (cash only). Omitted, the call
// behaves exactly as before: `amount` is applied as-is and any excess
// becomes a generic overpayment exception.
export type ExcessHandling = 'return_change' | 'advance' | 'pending_review';

export interface CashBreakdown {
  amountTendered: number;
  amountApplied: number;
  changeReturned: number;
  advanceCreated: number;
}

export const recordOrderPayment = (
  id: string,
  paymentMethod: PaymentMethod,
  options: { amount?: number; idempotencyKey: string; amountTendered?: number; excessHandling?: ExcessHandling }
) =>
  apiRequest<{ order: Order; paymentSummary: InvoicePaymentSummary; overpayment: boolean; cashBreakdown?: CashBreakdown }>(
    `/api/v1/orders/${id}/payment`,
    {
      method: 'PATCH',
      body: {
        paymentMethod,
        amount: options.amount,
        idempotencyKey: options.idempotencyKey,
        amountTendered: options.amountTendered,
        excessHandling: options.excessHandling,
      },
    }
  );

// Payment-safety review section 7 (Static Bank UPI Workflow, Stage A) —
// staff reports a transfer they believe landed on the business's static QR
// code; stays `pending` (shown in the Payment History below as "awaiting
// verification") until an admin verifies it (verifyBankUpiPayment, admin-
// only, not called from mobile staff screens).
export const reportBankUpiPayment = (orderId: string, amount: number, utrReference: string, notes?: string) =>
  apiRequest<{ payment: { id: string } }>(`/api/v1/orders/${orderId}/bank-upi-report`, {
    method: 'POST',
    body: { amount, utrReference, notes },
  }).then((res) => res.payment);

export const reviseOrderAmount = (id: string, newAmount: number, reason: string) =>
  apiRequest<{ order: Order }>(`/api/v1/orders/${id}/amount`, {
    method: 'PATCH',
    body: { newAmount, reason },
  }).then((res) => res.order);

// Admin-only — CLAUDE.md "Staff-scoped order visibility" edge case,
// resolved via a general (re)assignment control rather than a special
// creation-time flow.
export const assignOrderStaff = (id: string, staffId: string) =>
  apiRequest<{ order: Order }>(`/api/v1/orders/${id}/assign`, {
    method: 'PATCH',
    body: { staffId },
  }).then((res) => res.order);
