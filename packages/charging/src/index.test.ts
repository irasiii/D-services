import { describe, expect, it } from 'vitest';
import { computeCharge, haversineKm, quotePrice, vehicleCanServe } from './index.js';

describe('computeCharge', () => {
  it('takes a percentage commission', () => {
    expect(computeCharge(10000, { type: 'PERCENTAGE', bps: 1500 })).toEqual({
      grossCents: 10000,
      platformFeeCents: 1500,
      providerPayoutCents: 8500,
    });
  });
  it('rounds percentage fees to the nearest cent', () => {
    expect(computeCharge(333, { type: 'PERCENTAGE', bps: 1250 }).platformFeeCents).toBe(42); // 41.625
  });
  it('takes a fixed fee', () => {
    expect(computeCharge(50000, { type: 'FIXED', cents: 2500 })).toEqual({
      grossCents: 50000,
      platformFeeCents: 2500,
      providerPayoutCents: 47500,
    });
  });
  it('never charges more than the job price', () => {
    expect(computeCharge(1000, { type: 'FIXED', cents: 2500 })).toEqual({
      grossCents: 1000,
      platformFeeCents: 1000,
      providerPayoutCents: 0,
    });
  });
  it('fee plus payout always equals the price', () => {
    for (const gross of [0, 1, 99, 12345, 9999999]) {
      for (const bps of [0, 1, 999, 2000, 10000]) {
        const c = computeCharge(gross, { type: 'PERCENTAGE', bps });
        expect(c.platformFeeCents + c.providerPayoutCents).toBe(gross);
      }
    }
  });
  it('rejects invalid input', () => {
    expect(() => computeCharge(-1, { type: 'FIXED', cents: 0 })).toThrow(RangeError);
    expect(() => computeCharge(10.5, { type: 'FIXED', cents: 0 })).toThrow(RangeError);
    expect(() => computeCharge(100, { type: 'PERCENTAGE', bps: 10001 })).toThrow(RangeError);
  });
});

describe('quotePrice', () => {
  const tariff = { baseFareCents: 800, perKmCents: 150, minFareCents: 1200 };
  it('prices base plus distance for a car', () => {
    expect(quotePrice(tariff, 10, 'CAR')).toBe(2300);
  });
  it('scales with vehicle size', () => {
    expect(quotePrice(tariff, 10, 'VAN')).toBe(3220);
  });
  it('applies the minimum fare', () => {
    expect(quotePrice(tariff, 0.5, 'BIKE')).toBe(1200);
  });
});

describe('vehicleCanServe', () => {
  it('lets a bigger vehicle take a smaller job, not the reverse', () => {
    expect(vehicleCanServe('VAN', 'CAR')).toBe(true);
    expect(vehicleCanServe('CAR', 'VAN')).toBe(false);
  });
  it('requires a tipper for tipper jobs', () => {
    expect(vehicleCanServe('HEAVY_TRUCK', 'TIPPER')).toBe(false);
    expect(vehicleCanServe('TIPPER', 'TIPPER')).toBe(true);
    expect(vehicleCanServe('TIPPER', 'HEAVY_TRUCK')).toBe(true);
  });
});

describe('haversineKm', () => {
  it('measures Brisbane CBD to Brisbane Airport at roughly 17 km', () => {
    const d = haversineKm({ lat: -27.4698, lng: 153.0251 }, { lat: -27.3842, lng: 153.1175 });
    expect(d).toBeGreaterThan(12);
    expect(d).toBeLessThan(14.5);
  });
});
