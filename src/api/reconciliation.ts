import { apiRequest } from './client';

// Payment Reconciliation investigation views (2026-10-31) — deliberately
// READ-ONLY for this pass: fetchers only, no resolve/mark-reviewed calls.
// "Implement read-only investigation views first. Any allocation, refund,
// or financial correction action requires a separately reviewed design."
// The backend's resolve endpoints for both record types already exist
// (routes/payments.ts) and are already proven, by direct backend audit, to
// never touch Payment/PaymentAllocation — but wiring a write action into
// this screen is intentionally left for a later, separately reviewed pass.

// Note on units: unlike most of this app's endpoints (which convert to
// rupees server-side before responding), these two list endpoints return
// the raw Prisma rows after only BigInt->Number serialization — so every
// *Paise field here really is paise, not rupees. Divide by 100 when
// displaying (see formatPaise in the screen).

export interface RelatedPayment {
  id: string;
  razorpayPaymentId: string | null;
  amountPaise: number;
  paymentMethod: string;
  paymentSource: string;
}

export interface ReconciliationException {
  id: string;
  invoiceId: string | null;
  customerId: string;
  exceptionType: 'overpayment' | 'duplicate_utr' | 'cancellation_uncertain' | 'monthly_billing_anomaly';
  collectedPaise: number;
  allocatedPaise: number;
  excessPaise: number;
  relatedPaymentIds: string[];
  relatedPayments: RelatedPayment[];
  status: 'open' | 'resolved_refunded' | 'resolved_credited' | 'resolved_other';
  resolutionNotes: string | null;
  createdAt: string;
  customer: { fullName: string; phoneNumber: string; locationLabel: string } | null;
  invoice: { invoiceNumber: string; orderId: string } | null;
}

// Admin-only (routes/payments.ts gates the whole router).
export const fetchReconciliationExceptions = (status: string = 'all') =>
  apiRequest<{ exceptions: ReconciliationException[] }>(
    `/api/v1/payments/reconciliation-exceptions?status=${encodeURIComponent(status)}`
  ).then((res) => res.exceptions);

export interface UnmatchedProviderPayment {
  id: string;
  provider: string;
  razorpayPaymentId: string;
  razorpayPaymentLinkId: string | null;
  amountPaise: number;
  status: 'unresolved' | 'resolved' | 'ignored';
  resolutionNotes: string | null;
  createdAt: string;
}

export const fetchUnmatchedProviderPayments = (status: string = 'all') =>
  apiRequest<{ payments: UnmatchedProviderPayment[] }>(
    `/api/v1/payments/unmatched-provider-payments?status=${encodeURIComponent(status)}`
  ).then((res) => res.payments);
