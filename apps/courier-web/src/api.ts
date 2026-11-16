/** Client for the D-services core API. This app only uses the courier service. */
export const SERVICE_ID = 'courier';
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const VEHICLE_CLASSES = ['BIKE', 'CAR', 'VAN', 'LIGHT_TRUCK', 'HEAVY_TRUCK', 'TIPPER'] as const;
export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

export interface Place { address: string; lat: number; lng: number }
export interface Customer { id: string; name: string; email: string; status: string }
export interface Provider {
  id: string; name: string; email: string; status: 'PENDING' | 'APPROVED' | 'SUSPENDED';
  licenceNumber: string; licenceClass: string; vehicleClasses?: VehicleClass[]; serviceIds?: string[];
}
export interface Job {
  id: string; serviceTypeId: string; customerId: string; providerId: string | null;
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  description: string; vehicleClass: VehicleClass; pickupAddress: string; dropoffAddress: string;
  distanceKm: number; quotedPriceCents: number | null; agreedPriceCents: number | null; createdAt: string;
}
export interface Charge {
  id: string; jobId: string; serviceTypeId: string; providerId: string; grossCents: number;
  platformFeeCents: number; providerPayoutCents: number; status: 'PENDING' | 'PAID'; createdAt: string;
}
export interface Service {
  id: string; name: string; pricingMode: 'PLATFORM' | 'BIDDING'; feeType: 'PERCENTAGE' | 'FIXED';
  feeBps: number; feeFixedCents: number; baseFareCents: number; perKmCents: number; minFareCents: number;
}
export interface Summary {
  byService: { serviceTypeId: string; jobs: number; grossCents: number; platformFeeCents: number; providerPayoutCents: number }[];
  total: { jobs: number; grossCents: number; platformFeeCents: number; providerPayoutCents: number };
}
export interface Quote { distanceKm: number; priceCents: number | null }
export type Fee = { type: 'PERCENTAGE'; bps: number } | { type: 'FIXED'; cents: number };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Cannot reach the API at ${BASE}. Is it running?`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = (data.issues as { path: string; message: string }[] | undefined)?.map((i) => `${i.path}: ${i.message}`).join('; ');
    throw new Error(issues ? `${data.error} (${issues})` : (data.error ?? `Request failed (${res.status})`));
  }
  return data as T;
}

export const api = {
  customers: () => request<Customer[]>('GET', '/customers'),
  createCustomer: (c: { name: string; email: string }) => request<Customer>('POST', '/customers', c),
  providers: () => request<Provider[]>('GET', '/providers'),
  createProvider: (p: { name: string; email: string; licenceNumber: string; licenceClass: string; vehicleClass: VehicleClass }) =>
    request<Provider>('POST', '/providers', {
      name: p.name, email: p.email, licenceNumber: p.licenceNumber, licenceClass: p.licenceClass,
      vehicles: [{ vehicleClass: p.vehicleClass }], serviceIds: [SERVICE_ID],
    }),
  setProviderStatus: (id: string, action: 'approve' | 'suspend') => request<Provider>('POST', `/providers/${id}/${action}`),
  quote: (pickup: Place, dropoff: Place, vehicleClass: VehicleClass) =>
    request<Quote>('POST', '/quotes', { serviceId: SERVICE_ID, pickup, dropoff, vehicleClass }),
  createJob: (j: { customerId: string; description: string; pickup: Place; dropoff: Place; vehicleClass: VehicleClass }) =>
    request<Job>('POST', '/jobs', { serviceId: SERVICE_ID, ...j }),
  jobs: (filter: Record<string, string>) =>
    request<Job[]>('GET', '/jobs?' + new URLSearchParams({ serviceId: SERVICE_ID, ...filter }).toString()),
  jobAction: (id: string, action: 'start' | 'complete' | 'cancel') => request<Job>('POST', `/jobs/${id}/${action}`),
  acceptJob: (id: string, providerId: string) => request<Job>('POST', `/jobs/${id}/accept`, { providerId }),
  charges: (filter: Record<string, string> = {}) => request<Charge[]>('GET', '/charges?' + new URLSearchParams(filter).toString()),
  markPaid: (id: string) => request<Charge>('POST', `/charges/${id}/mark-paid`),
  summary: () => request<Summary>('GET', '/charges/summary'),
  service: () => request<Service>('GET', `/services/${SERVICE_ID}`),
  updateFee: (fee: Fee) => request<Service>('PATCH', `/services/${SERVICE_ID}`, { fee }),
};

export const money = (cents: number | null | undefined) =>
  cents == null ? '—' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);

/** Demo locations until address search (geocoding) is connected. */
export const PLACES: Place[] = [
  { address: 'Brisbane CBD', lat: -27.4698, lng: 153.0251 },
  { address: 'South Bank', lat: -27.481, lng: 153.0234 },
  { address: 'Fortitude Valley', lat: -27.4573, lng: 153.0355 },
  { address: 'Chermside', lat: -27.3858, lng: 153.031 },
  { address: 'Indooroopilly', lat: -27.499, lng: 152.973 },
  { address: 'Brisbane Airport', lat: -27.3842, lng: 153.1175 },
  { address: 'Logan Central', lat: -27.6392, lng: 153.1094 },
  { address: 'Ipswich', lat: -27.614, lng: 152.76 },
];
