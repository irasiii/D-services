import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createPool, type Db } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('Set TEST_DATABASE_URL (or DATABASE_URL) to a disposable PostgreSQL database');

let db: Db;
let app: FastifyInstance;

const CBD = { address: 'Brisbane CBD', lat: -27.4698, lng: 153.0251 };
const AIRPORT = { address: 'Brisbane Airport', lat: -27.3842, lng: 153.1175 };

async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown) {
  const res = await app.inject({ method, url: path, payload: body as object | undefined });
  return { status: res.statusCode, body: res.json() };
}

let seq = 0;
async function newCustomer() {
  const res = await call('POST', '/customers', { name: 'Casey Customer', email: `casey${++seq}@example.com` });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function newProvider(vehicleClass: string, serviceIds: string[], approve = true) {
  const res = await call('POST', '/providers', {
    name: 'Pat Provider',
    email: `pat${++seq}@example.com`,
    licenceNumber: 'QLD123456',
    licenceClass: 'C',
    vehicles: [{ vehicleClass, registration: `REG${seq}` }],
    serviceIds,
  });
  expect(res.status).toBe(201);
  expect(res.body.status).toBe('PENDING');
  if (approve) expect((await call('POST', `/providers/${res.body.id}/approve`)).body.status).toBe('APPROVED');
  return res.body.id as string;
}

beforeAll(async () => {
  db = createPool(url);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  app = await buildApp({ db });
});

afterAll(async () => {
  await app.close();
  await db.end();
});

describe('service catalogue', () => {
  it('lists the seeded services with their pricing and fee model', async () => {
    const { status, body } = await call('GET', '/services');
    expect(status).toBe(200);
    expect(body.map((s: { id: string }) => s.id).sort()).toEqual(['courier', 'earthworks', 'food', 'freight', 'removals', 'rides']);
    const courier = body.find((s: { id: string }) => s.id === 'courier');
    expect(courier).toMatchObject({ pricingMode: 'PLATFORM', feeType: 'PERCENTAGE', feeBps: 1500 });
  });

  it('running migrations again changes nothing, even from several replicas at once', async () => {
    expect(await Promise.all([migrate(db), migrate(db), migrate(db)])).toEqual([[], [], []]);
  });

  it('reports liveness and readiness', async () => {
    expect((await call('GET', '/livez')).body).toEqual({ status: 'ok' });
    expect((await call('GET', '/health')).body).toEqual({ status: 'ok' });
  });
});

describe('validation', () => {
  it('rejects a bad email and duplicate customers', async () => {
    expect((await call('POST', '/customers', { name: 'X', email: 'not-an-email' })).status).toBe(400);
    const email = `dup${++seq}@example.com`;
    expect((await call('POST', '/customers', { name: 'X', email })).status).toBe(201);
    expect((await call('POST', '/customers', { name: 'X', email })).status).toBe(409);
  });

  it('returns 404 for unknown records and 400 for malformed ids', async () => {
    expect((await call('GET', '/customers/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await call('GET', '/jobs/not-a-uuid')).status).toBe(400);
  });

  it('rejects a provider registering for a service that does not exist', async () => {
    const res = await call('POST', '/providers', {
      name: 'P',
      email: `p${++seq}@example.com`,
      licenceNumber: 'L1',
      licenceClass: 'C',
      vehicles: [{ vehicleClass: 'CAR' }],
      serviceIds: ['teleport'],
    });
    expect(res.status).toBe(422);
  });
});

describe('courier: platform-priced job', () => {
  it('quotes, books, assigns, completes and charges 15% commission', async () => {
    const customerId = await newCustomer();
    const providerId = await newProvider('VAN', ['courier']);

    const quote = await call('POST', '/quotes', { serviceId: 'courier', pickup: CBD, dropoff: AIRPORT, vehicleClass: 'CAR' });
    expect(quote.status).toBe(200);
    expect(quote.body.priceCents).toBeGreaterThan(1200);

    const job = await call('POST', '/jobs', {
      serviceId: 'courier',
      customerId,
      description: 'Box of documents',
      pickup: CBD,
      dropoff: AIRPORT,
      vehicleClass: 'CAR',
    });
    expect(job.status).toBe(201);
    expect(job.body).toMatchObject({ status: 'OPEN', quotedPriceCents: quote.body.priceCents, providerId: null });
    const jobId = job.body.id as string;

    // Cannot complete before it is assigned and started
    expect((await call('POST', `/jobs/${jobId}/complete`)).status).toBe(409);
    // Bidding is not allowed on a platform-priced service
    expect((await call('POST', `/jobs/${jobId}/bids`, { providerId, amountCents: 1000 })).status).toBe(422);

    const accepted = await call('POST', `/jobs/${jobId}/accept`, { providerId });
    expect(accepted.body).toMatchObject({ status: 'ASSIGNED', providerId, agreedPriceCents: quote.body.priceCents });

    // A second provider cannot take a job that is already assigned
    const other = await newProvider('CAR', ['courier']);
    expect((await call('POST', `/jobs/${jobId}/accept`, { providerId: other })).status).toBe(409);

    expect((await call('POST', `/jobs/${jobId}/start`)).body.status).toBe('IN_PROGRESS');
    const done = await call('POST', `/jobs/${jobId}/complete`);
    expect(done.body.status).toBe('COMPLETED');

    const gross = quote.body.priceCents as number;
    const fee = Math.round(gross * 0.15);
    expect(done.body.charge).toMatchObject({
      grossCents: gross,
      platformFeeCents: fee,
      providerPayoutCents: gross - fee,
      feeType: 'PERCENTAGE',
      status: 'PENDING',
    });

    // Completing twice must not create a second charge
    expect((await call('POST', `/jobs/${jobId}/complete`)).status).toBe(409);
    expect((await call('GET', `/charges?providerId=${providerId}`)).body).toHaveLength(1);

    const paid = await call('POST', `/charges/${done.body.charge.id}/mark-paid`);
    expect(paid.body.status).toBe('PAID');
  });

  it('refuses providers who are unapproved, not enrolled, or have too small a vehicle', async () => {
    const customerId = await newCustomer();
    const job = await call('POST', '/jobs', { serviceId: 'courier', customerId, pickup: CBD, dropoff: AIRPORT, vehicleClass: 'VAN' });
    const jobId = job.body.id as string;

    const pending = await newProvider('VAN', ['courier'], false);
    const wrongService = await newProvider('VAN', ['removals']);
    const smallVehicle = await newProvider('CAR', ['courier']);
    for (const providerId of [pending, wrongService, smallVehicle]) {
      expect((await call('POST', `/jobs/${jobId}/accept`, { providerId })).status).toBe(422);
    }
    expect((await call('GET', `/jobs/${jobId}`)).body.status).toBe('OPEN');
  });

  it('lets a customer cancel before the job starts, but not after', async () => {
    const customerId = await newCustomer();
    const providerId = await newProvider('CAR', ['courier']);
    const mk = async () =>
      (await call('POST', '/jobs', { serviceId: 'courier', customerId, pickup: CBD, dropoff: AIRPORT, vehicleClass: 'CAR' })).body.id as string;

    const a = await mk();
    expect((await call('POST', `/jobs/${a}/cancel`)).body.status).toBe('CANCELLED');

    const b = await mk();
    await call('POST', `/jobs/${b}/accept`, { providerId });
    await call('POST', `/jobs/${b}/start`);
    expect((await call('POST', `/jobs/${b}/cancel`)).status).toBe(409);
  });

  it('blocks bookings from a blocked customer', async () => {
    const customerId = await newCustomer();
    await call('POST', `/customers/${customerId}/block`);
    const res = await call('POST', '/jobs', { serviceId: 'courier', customerId, pickup: CBD, dropoff: AIRPORT, vehicleClass: 'CAR' });
    expect(res.status).toBe(422);
  });
});

describe('freight: bidding job with a fixed fee', () => {
  it('collects bids, assigns the chosen bid, and charges the fixed fee', async () => {
    const customerId = await newCustomer();
    const cheap = await newProvider('HEAVY_TRUCK', ['freight']);
    const dear = await newProvider('HEAVY_TRUCK', ['freight']);

    const job = await call('POST', '/jobs', {
      serviceId: 'freight',
      customerId,
      description: '12 pallets Brisbane to Sydney',
      pickup: CBD,
      dropoff: { address: 'Sydney', lat: -33.8688, lng: 151.2093 },
      vehicleClass: 'HEAVY_TRUCK',
    });
    expect(job.body).toMatchObject({ status: 'OPEN', quotedPriceCents: null });
    const jobId = job.body.id as string;

    // Accepting directly is not allowed on a bidding service
    expect((await call('POST', `/jobs/${jobId}/accept`, { providerId: cheap })).status).toBe(422);

    await call('POST', `/jobs/${jobId}/bids`, { providerId: dear, amountCents: 260000 });
    await call('POST', `/jobs/${jobId}/bids`, { providerId: cheap, amountCents: 250000 });
    const rebid = await call('POST', `/jobs/${jobId}/bids`, { providerId: cheap, amountCents: 240000 });
    expect(rebid.status).toBe(201);
    expect(rebid.body.bids).toHaveLength(2);
    expect(rebid.body.bids[0]).toMatchObject({ providerId: cheap, amountCents: 240000 });

    const assigned = await call('POST', `/jobs/${jobId}/bids/${rebid.body.bids[0].id}/accept`);
    expect(assigned.body).toMatchObject({ status: 'ASSIGNED', providerId: cheap, agreedPriceCents: 240000 });
    expect(assigned.body.bids.map((b: { status: string }) => b.status).sort()).toEqual(['ACCEPTED', 'REJECTED']);

    await call('POST', `/jobs/${jobId}/start`);
    const done = await call('POST', `/jobs/${jobId}/complete`);
    expect(done.body.charge).toMatchObject({
      grossCents: 240000,
      platformFeeCents: 5000,
      providerPayoutCents: 235000,
      feeType: 'FIXED',
    });
  });
});

describe('fee rules', () => {
  it('uses a provider-specific negotiated fee over the service default', async () => {
    const customerId = await newCustomer();
    const providerId = await newProvider('TIPPER', ['earthworks']);
    const deal = await call('PUT', `/providers/${providerId}/services/earthworks`, { fee: { type: 'PERCENTAGE', bps: 500 } });
    expect(deal.status).toBe(200);

    const job = await call('POST', '/jobs', { serviceId: 'earthworks', customerId, pickup: CBD, dropoff: AIRPORT, vehicleClass: 'TIPPER' });
    const bid = await call('POST', `/jobs/${job.body.id}/bids`, { providerId, amountCents: 80000 });
    await call('POST', `/jobs/${job.body.id}/bids/${bid.body.bids[0].id}/accept`);
    await call('POST', `/jobs/${job.body.id}/start`);
    const done = await call('POST', `/jobs/${job.body.id}/complete`);
    expect(done.body.charge).toMatchObject({ platformFeeCents: 4000, providerPayoutCents: 76000, feeType: 'PERCENTAGE', feeBps: 500 });
  });

  it('lets the company change a service fee, affecting later jobs only', async () => {
    const before = (await call('GET', '/charges/summary')).body;
    const updated = await call('PATCH', '/services/food', { fee: { type: 'FIXED', cents: 300 } });
    expect(updated.body).toMatchObject({ feeType: 'FIXED', feeFixedCents: 300 });
    expect((await call('PATCH', '/services/food', { fee: { type: 'PERCENTAGE', bps: 20000 } })).status).toBe(400);
    expect((await call('GET', '/charges/summary')).body).toEqual(before);
  });

  it('summarises revenue per service and in total', async () => {
    const { body } = await call('GET', '/charges/summary');
    const services = body.byService.map((r: { serviceTypeId: string }) => r.serviceTypeId);
    expect(services).toEqual(['courier', 'earthworks', 'freight']);
    expect(body.total.jobs).toBe(3);
    expect(body.total.platformFeeCents + body.total.providerPayoutCents).toBe(body.total.grossCents);
    const freight = body.byService.find((r: { serviceTypeId: string }) => r.serviceTypeId === 'freight');
    expect(freight).toMatchObject({ jobs: 1, grossCents: 240000, platformFeeCents: 5000 });
  });
});
