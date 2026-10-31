import { apiRequest } from './client';

// Payment collection / customer advances rework (2026-10-31), Phase 7 —
// "make balances visible to Admin and authorized Staff" (both roles can
// GET); refund/reversal are Admin-only, enforced server-side too.

export interface CustomerCreditBalance {
  availablePaise: number;
  issuedTotalPaise: number;
  appliedTotalPaise: number;
  refundedTotalPaise: number;
}

export const fetchCustomerCreditBalance = (customerId: string) =>
  apiRequest<{ balance: CustomerCreditBalance }>(`/api/v1/customers/${customerId}/credit-balance`).then(
    (res) => res.balance
  );

export interface CustomerCreditTransaction {
  id: string;
  transactionType: 'issued' | 'applied' | 'refunded' | 'reversed';
  amountPaise: number;
  reason: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string } | null;
  appliedToInvoice: { invoiceNumber: string } | null;
  reversalOf: { id: string; transactionType: string; amountPaise: number } | null;
}

export const fetchCustomerCreditHistory = (customerId: string) =>
  apiRequest<{ history: CustomerCreditTransaction[] }>(`/api/v1/customers/${customerId}/credit-history`).then(
    (res) => res.history
  );

// Admin-only.
export const refundCustomerCredit = (customerId: string, amount: number, reason: string) =>
  apiRequest<{ transaction: CustomerCreditTransaction }>(`/api/v1/customers/${customerId}/credit-refund`, {
    method: 'POST',
    body: { amount, reason },
  }).then((res) => res.transaction);

// Admin-only.
export const reverseCustomerCreditTransaction = (customerId: string, transactionId: string, reason: string) =>
  apiRequest<{ transaction: CustomerCreditTransaction }>(
    `/api/v1/customers/${customerId}/credit-transactions/${transactionId}/reverse`,
    { method: 'POST', body: { reason } }
  ).then((res) => res.transaction);
