/**
 * Charging rules shared by every D-services app.
 * All money is in integer cents to avoid floating point errors.
 */

/** How the company earns on a job: a percentage of the price, or a fixed fee. */
export type FeeRule =
  | { type: 'PERCENTAGE'; bps: number } // basis points: 1500 = 15%
  | { type: 'FIXED'; cents: number };

export interface ChargeBreakdown {
  grossCents: number; // what the customer pays
  platformFeeCents: number; // what D-services keeps
  providerPayoutCents: number; // what the provider receives
}

function assertCents(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer number of cents`);
  }
}

/** Split a job price into the company fee and the provider payout. */
export function computeCharge(grossCents: number, rule: FeeRule): ChargeBreakdown {
  assertCents('grossCents', grossCents);
  let fee: number;
  if (rule.type === 'PERCENTAGE') {
    if (!Number.isInteger(rule.bps) || rule.bps < 0 || rule.bps > 10000) {
      throw new RangeError('bps must be an integer between 0 and 10000');
    }
    fee = Math.round((grossCents * rule.bps) / 10000);
  } else {
    assertCents('cents', rule.cents);
    fee = rule.cents;
  }
  // The fee can never exceed the job price: the provider is never charged to work.
  const platformFeeCents = Math.min(fee, grossCents);
  return { grossCents, platformFeeCents, providerPayoutCents: grossCents - platformFeeCents };
}

/** Vehicle classes, smallest to largest. Any size can register. */
export const VEHICLE_CLASSES = ['BIKE', 'CAR', 'VAN', 'LIGHT_TRUCK', 'HEAVY_TRUCK', 'TIPPER'] as const;
export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

/** Price multiplier per vehicle class for platform-priced services. */
export const VEHICLE_MULTIPLIER: Record<VehicleClass, number> = {
  BIKE: 0.8,
  CAR: 1,
  VAN: 1.4,
  LIGHT_TRUCK: 2,
  HEAVY_TRUCK: 3.5,
  TIPPER: 3.5,
};

/** Carrying rank: a provider can take a job if they own a vehicle at least this capable. */
const VEHICLE_RANK: Record<VehicleClass, number> = {
  BIKE: 0,
  CAR: 1,
  VAN: 2,
  LIGHT_TRUCK: 3,
  HEAVY_TRUCK: 4,
  TIPPER: 4,
};

/** True when a vehicle of class `owned` can do a job that asks for `required`. */
export function vehicleCanServe(owned: VehicleClass, required: VehicleClass): boolean {
  if (required === 'TIPPER') return owned === 'TIPPER'; // tipping needs a tipper body
  return VEHICLE_RANK[owned] >= VEHICLE_RANK[required];
}

export interface Tariff {
  baseFareCents: number;
  perKmCents: number;
  minFareCents: number;
}

/** Platform-set price for a job: (base + distance) scaled by vehicle size, never below the minimum. */
export function quotePrice(tariff: Tariff, distanceKm: number, vehicleClass: VehicleClass): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError('distanceKm must be a non-negative number');
  }
  const raw = (tariff.baseFareCents + tariff.perKmCents * distanceKm) * VEHICLE_MULTIPLIER[vehicleClass];
  return Math.max(tariff.minFareCents, Math.round(raw));
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Straight-line distance in km. A routing service should replace this for road distance. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
