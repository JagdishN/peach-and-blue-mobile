import { apiRequest } from './client';

// Third-party vendor invoice management — fully separate from
// customer invoices/payments (no Razorpay/UPI/bank-verification/
// reminder/allocation concept anywhere here). Admin-only, reached via
// Settings/Setup, not the bottom tab bar.

export const VENDOR_SERVICE_TYPES = ['wash_fold', 'wash_fold_iron', 'dry_cleaning'] as const;
export type VendorServiceType = (typeof VENDOR_SERVICE_TYPES)[number];

export const VENDOR_SERVICE_TYPE_LABELS: Record<VendorServiceType, string> = {
  wash_fold: 'Wash & Fold',
  wash_fold_iron: 'Wash, Fold & Ironing',
  dry_cleaning: 'Dry Cleaning',
};

export type VendorPaymentStatus = 'unpaid' | 'paid';

export interface VendorInvoice {
  id: string;
  vendorName: string;
  description: string | null;
  serviceType: VendorServiceType;
  amount: number;
  paymentStatus: VendorPaymentStatus;
  branchId: string | null;
  branch: { branchName: string } | null;
  paidAt: string | null;
  voidedAt: string | null;
  createdAt: string;
}

export interface VendorInvoiceFilters {
  branchId?: string;
  search?: string;
  paymentStatus?: 'all' | VendorPaymentStatus;
  serviceType?: VendorServiceType;
  limit?: number;
  offset?: number;
}

export interface VendorInvoiceSummary {
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
}

const toQueryString = (filters: VendorInvoiceFilters): string => {
  const params = new URLSearchParams();
  if (filters.branchId) params.set('branchId', filters.branchId);
  if (filters.search) params.set('search', filters.search);
  if (filters.paymentStatus) params.set('paymentStatus', filters.paymentStatus);
  if (filters.serviceType) params.set('serviceType', filters.serviceType);
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.offset !== undefined) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

export const fetchVendorInvoices = (filters: VendorInvoiceFilters = {}) =>
  apiRequest<{ rows: VendorInvoice[]; total: number; summary: VendorInvoiceSummary }>(
    `/api/v1/vendor-invoices${toQueryString(filters)}`
  );

export interface VendorInvoiceInput {
  vendorName: string;
  description?: string;
  serviceType: VendorServiceType;
  amount: number;
  paymentDone?: boolean;
  branchId?: string | null;
}

export const createVendorInvoice = (input: VendorInvoiceInput) =>
  apiRequest<{ invoice: VendorInvoice }>('/api/v1/vendor-invoices', { method: 'POST', body: input }).then((res) => res.invoice);

export const updateVendorInvoice = (id: string, input: Partial<VendorInvoiceInput>) =>
  apiRequest<{ invoice: VendorInvoice }>(`/api/v1/vendor-invoices/${id}`, { method: 'PATCH', body: input }).then(
    (res) => res.invoice
  );

export const voidVendorInvoice = (id: string, reason: string) =>
  apiRequest<{ invoice: VendorInvoice }>(`/api/v1/vendor-invoices/${id}/void`, { method: 'POST', body: { reason } }).then(
    (res) => res.invoice
  );
