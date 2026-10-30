import { apiRequest } from './client';

// Outstanding-dues rework — the per-ORDER/invoice outstanding model,
// distinct from ledger.ts's AgingRow (the separate monthly-billing
// running-balance model — see backend CLAUDE.md's Phase 1 audit finding
// that these are genuinely two different financial systems, not one).

export interface InvoiceAgingRow {
  branchId: string;
  branchName: string;
  customerId: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  originalAmount: number;
  amountPaid: number;
  outstanding: number;
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
  lastPaymentDate: string | null;
  paymentMethods: string[];
  razorpayReferences: string[];
  bankUpiReferences: string[];
  daysOverdue: number;
  agingCategory: 'not_yet_due' | '1-7' | '8-15' | '16-30' | 'over_30';
  reminderCount: number;
  lastReminderDate: string | null;
  verificationStatus: 'verified' | 'pending_verification' | 'n/a';
}

// Admin-only backend endpoint — doubles as the data source for the
// Outstanding Payments dashboard/list (grouped client-side by customer,
// since the backend returns one row per invoice).
export const fetchInvoiceAgingReport = () =>
  apiRequest<{ rows: InvoiceAgingRow[] }>('/api/v1/reports/aging').then((res) => res.rows);

export interface InvoiceOutstandingRow {
  invoiceId: string;
  invoiceNumber: string;
  orderId: string;
  orderNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  originalAmount: number;
  collected: number;
  // Admin Payment Override — sum of active (non-reversed) waivers on this
  // invoice. 0 for an invoice nobody has closed.
  waivedAmount: number;
  outstanding: number;
  status: 'unpaid' | 'partially_paid' | 'paid';
}

export interface CustomerOutstandingSummary {
  customerId: string;
  invoices: InvoiceOutstandingRow[];
  totalOutstanding: number;
  totalCollected: number;
  totalOriginal: number;
}

// Staff + admin.
export const fetchCustomerOutstanding = (customerId: string) =>
  apiRequest<{ outstanding: CustomerOutstandingSummary }>(`/api/v1/customers/${customerId}/outstanding`).then(
    (res) => res.outstanding
  );

export interface ReminderResult {
  reminderId: string;
  outstandingAtSend: number;
  recipientPhoneNumbers: string[];
  deliveryStatus: 'sent' | 'partial' | 'failed';
}

// Admin-only, enforced server-side too — see outstanding-dues rework
// section 7. Staff never gets a UI entry point to this at all (not just a
// disabled button).
export const sendPaymentReminder = (customerId: string, invoiceIds?: string[], overrideDuplicateWarning?: boolean) =>
  apiRequest<{ reminder: ReminderResult }>(`/api/v1/customers/${customerId}/send-reminder`, {
    method: 'POST',
    body: { invoiceIds, overrideDuplicateWarning },
  }).then((res) => res.reminder);

export interface ReminderLogEntry {
  id: string;
  invoiceIds: string[];
  outstandingAtSend: number;
  recipientPhoneNumbers: string[];
  deliveryStatus: 'sent' | 'partial' | 'failed';
  sentAt: string;
}

export const fetchReminderHistory = (customerId: string) =>
  apiRequest<{ history: ReminderLogEntry[] }>(`/api/v1/customers/${customerId}/reminder-history`).then(
    (res) => res.history
  );
