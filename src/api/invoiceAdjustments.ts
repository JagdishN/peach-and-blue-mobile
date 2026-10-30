import { apiRequest } from './client';

// Admin Payment Override — admin-only, enforced server-side too
// (routes/payments.ts gates this whole router to requireRole(['admin'])).
// Staff never gets a UI entry point to this at all — same precedent as
// outstanding.ts's sendPaymentReminder.

export type ReasonCategory = 'goodwill' | 'discount_adjustment' | 'billing_correction' | 'other';

export const REASON_CATEGORY_LABELS: Record<ReasonCategory, string> = {
  goodwill: 'Customer goodwill waiver',
  discount_adjustment: 'Approved discount/adjustment',
  billing_correction: 'Billing correction',
  other: 'Other',
};

export interface CloseOutstandingBalanceResult {
  adjustmentId: string;
  waivedAmount: number;
  outstandingBefore: number;
  outstandingAfter: number;
  linkLifecycle: 'not_applicable' | 'completed' | 'needs_review';
}

export const closeOutstandingBalance = (
  invoiceId: string,
  reasonCategory: ReasonCategory,
  reason: string,
  idempotencyKey: string
) =>
  apiRequest<CloseOutstandingBalanceResult>(`/api/v1/payments/invoices/${invoiceId}/close-outstanding`, {
    method: 'POST',
    body: { reasonCategory, reason, idempotencyKey },
  });

export interface InvoiceAdjustment {
  id: string;
  invoiceId: string;
  adjustmentType: string;
  amount: number;
  reasonCategory: ReasonCategory;
  reason: string;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  reversedAt: string | null;
  reversedBy: { id: string; fullName: string } | null;
  reversalReason: string | null;
}

export const fetchInvoiceAdjustments = (invoiceId: string) =>
  apiRequest<{ adjustments: InvoiceAdjustment[] }>(`/api/v1/payments/invoices/${invoiceId}/adjustments`).then(
    (res) => res.adjustments
  );

export interface ReverseAdjustmentResult {
  adjustmentId: string;
  outstandingBefore: number;
  outstandingAfter: number;
  linkLifecycle: 'not_applicable' | 'completed' | 'needs_review';
}

export const reverseInvoiceAdjustment = (invoiceId: string, adjustmentId: string, reversalReason: string) =>
  apiRequest<ReverseAdjustmentResult>(`/api/v1/payments/invoices/${invoiceId}/adjustments/${adjustmentId}/reverse`, {
    method: 'POST',
    body: { reversalReason },
  });
