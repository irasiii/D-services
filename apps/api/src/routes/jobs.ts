import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  computeCharge,
  haversineKm,
  quotePrice,
  vehicleCanServe,
  type FeeRule,
  type VehicleClass,
} from '@d-services/charging';
import { many, one, tx, type Db, type Queryable } from '../db.js';
import { conflict, notFound, unprocessable } from '../errors.js';
import { id, idParam, place, vehicleClass } from '../schemas.js';

const serviceId = z.string().regex(/^[a-z][a-z0-9-]{1,30}$/);

const quoteRequest = z.object({ serviceId, pickup: place, dropoff: place, vehicleClass });

const jobCreate = quoteRequest.extend({
  customerId: id,
  description: z.string().trim().max(2000).default(''),
});

interface ServiceRow {
  id: string;
  pricingMode: 'PLATFORM' | 'BIDDING';
  feeType: 'PERCENTAGE' | 'FIXED';
  feeBps: number;
  feeFixedCents: number;
  baseFareCents: number;
  perKmCents: number;
  minFareCents: number;
  active: boolean;
}

interface JobRow {
  id: string;
  serviceTypeId: string;
  customerId: string;
  providerId: string | null;
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  vehicleClass: VehicleClass;
  quotedPriceCents: number | null;
  agreedPriceCents: number | null;
}

async function getService(q: Queryable, sid: string): Promise<ServiceRow> {
  const service = await one<ServiceRow>(q, 'SELECT * FROM service_types WHERE id = $1', [sid]);
  if (!service) throw notFound('Service');
  return service;
}

async function lockJob(q: Queryable, jobId: string): Promise<JobRow> {
  const job = await one<JobRow>(q, 'SELECT * FROM jobs WHERE id = $1 FOR UPDATE', [jobId]);
  if (!job) throw notFound('Job');
  return job;
}

function requireStatus(job: JobRow, ...allowed: JobRow['status'][]) {
  if (!allowed.includes(job.status)) {
    throw conflict(`Job is ${job.status}; expected ${allowed.join(' or ')}`);
  }
}

/** A provider may take a job only if approved, enrolled in the service, and owning a big enough vehicle. */
async function requireEligibleProvider(q: Queryable, providerId: string, job: JobRow) {
  const provider = await one<{ status: string }>(q, 'SELECT status FROM providers WHERE id = $1', [providerId]);
  if (!provider) throw notFound('Provider');
  if (provider.status !== 'APPROVED') throw unprocessable('Provider is not approved');
  const enrolled = await one(q, 'SELECT 1 AS ok FROM provider_services WHERE provider_id = $1 AND service_type_id = $2', [
    providerId,
    job.serviceTypeId,
  ]);
  if (!enrolled) throw unprocessable('Provider does not offer this service');
  const vehicles = await many<{ vehicleClass: VehicleClass }>(q, 'SELECT vehicle_class FROM vehicles WHERE provider_id = $1', [
    providerId,
  ]);
  if (!vehicles.some((v) => vehicleCanServe(v.vehicleClass, job.vehicleClass))) {
    throw unprocessable(`Provider has no vehicle suitable for a ${job.vehicleClass} job`);
  }
}

/** The provider's negotiated fee for this service if there is one, otherwise the service default. */
async function resolveFeeRule(q: Queryable, service: ServiceRow, providerId: string): Promise<FeeRule> {
  const override = await one<{ feeType: string | null; feeBps: number | null; feeFixedCents: number | null }>(
    q,
    'SELECT fee_type, fee_bps, fee_fixed_cents FROM provider_services WHERE provider_id = $1 AND service_type_id = $2',
    [providerId, service.id],
  );
  const src = override?.feeType ? override : service;
  return src.feeType === 'PERCENTAGE'
    ? { type: 'PERCENTAGE', bps: src.feeBps ?? 0 }
    : { type: 'FIXED', cents: src.feeFixedCents ?? 0 };
}

async function loadJob(q: Queryable, jobId: string) {
  const job = await one(q, 'SELECT * FROM jobs WHERE id = $1', [jobId]);
  if (!job) throw notFound('Job');
  const bids = await many(q, 'SELECT * FROM bids WHERE job_id = $1 ORDER BY amount_cents, created_at', [jobId]);
  const charge = await one(q, 'SELECT * FROM charges WHERE job_id = $1', [jobId]);
  return { ...job, bids, charge: charge ?? null };
}

export async function jobRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /** Price preview for platform-priced services. */
  app.post('/quotes', async (req) => {
    const body = quoteRequest.parse(req.body);
    const service = await getService(db, body.serviceId);
    const distanceKm = haversineKm(body.pickup, body.dropoff);
    return {
      serviceId: service.id,
      pricingMode: service.pricingMode,
      distanceKm: Math.round(distanceKm * 10) / 10,
      priceCents: service.pricingMode === 'PLATFORM' ? quotePrice(service, distanceKm, body.vehicleClass) : null,
    };
  });

  /** Customer books a job. PLATFORM services get a price immediately; BIDDING services wait for bids. */
  app.post('/jobs', async (req, reply) => {
    const body = jobCreate.parse(req.body);
    const service = await getService(db, body.serviceId);
    if (!service.active) throw unprocessable('Service is not available');
    const customer = await one<{ status: string }>(db, 'SELECT status FROM customers WHERE id = $1', [body.customerId]);
    if (!customer) throw notFound('Customer');
    if (customer.status !== 'ACTIVE') throw unprocessable('Customer account is blocked');
    const distanceKm = haversineKm(body.pickup, body.dropoff);
    const quoted = service.pricingMode === 'PLATFORM' ? quotePrice(service, distanceKm, body.vehicleClass) : null;
    const row = await one<{ id: string }>(
      db,
      `INSERT INTO jobs (service_type_id, customer_id, description, vehicle_class,
                         pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
                         distance_km, quoted_price_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        service.id,
        body.customerId,
        body.description,
        body.vehicleClass,
        body.pickup.address,
        body.pickup.lat,
        body.pickup.lng,
        body.dropoff.address,
        body.dropoff.lat,
        body.dropoff.lng,
        distanceKm,
        quoted,
      ],
    );
    return reply.status(201).send(await loadJob(db, row!.id));
  });

  app.get('/jobs', async (req) => {
    const q = z
      .object({
        status: z.enum(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
        serviceId: serviceId.optional(),
        customerId: id.optional(),
        providerId: id.optional(),
      })
      .parse(req.query);
    return many(
      db,
      `SELECT * FROM jobs
       WHERE ($1::text IS NULL OR status = $1)
         AND ($2::text IS NULL OR service_type_id = $2)
         AND ($3::uuid IS NULL OR customer_id = $3)
         AND ($4::uuid IS NULL OR provider_id = $4)
       ORDER BY created_at DESC LIMIT 200`,
      [q.status ?? null, q.serviceId ?? null, q.customerId ?? null, q.providerId ?? null],
    );
  });

  app.get('/jobs/:id', async (req) => loadJob(db, idParam.parse(req.params).id));

  /** PLATFORM services: a provider takes the job at the quoted price. First to accept wins. */
  app.post('/jobs/:id/accept', async (req) => {
    const { id: jobId } = idParam.parse(req.params);
    const { providerId } = z.object({ providerId: id }).parse(req.body);
    await tx(db, async (c) => {
      const job = await lockJob(c, jobId);
      const service = await getService(c, job.serviceTypeId);
      if (service.pricingMode !== 'PLATFORM') throw unprocessable('This service is assigned through bids');
      requireStatus(job, 'OPEN');
      await requireEligibleProvider(c, providerId, job);
      await c.query("UPDATE jobs SET provider_id = $2, agreed_price_cents = quoted_price_cents, status = 'ASSIGNED' WHERE id = $1", [
        jobId,
        providerId,
      ]);
    });
    return loadJob(db, jobId);
  });

  /** BIDDING services: a provider offers a price. Bidding again replaces the earlier bid. */
  app.post('/jobs/:id/bids', async (req, reply) => {
    const { id: jobId } = idParam.parse(req.params);
    const body = z.object({ providerId: id, amountCents: z.number().int().min(1).max(2_000_000_000) }).parse(req.body);
    await tx(db, async (c) => {
      const job = await lockJob(c, jobId);
      const service = await getService(c, job.serviceTypeId);
      if (service.pricingMode !== 'BIDDING') throw unprocessable('This service has a platform price; accept the job instead');
      requireStatus(job, 'OPEN');
      await requireEligibleProvider(c, body.providerId, job);
      await c.query(
        `INSERT INTO bids (job_id, provider_id, amount_cents) VALUES ($1, $2, $3)
         ON CONFLICT (job_id, provider_id) DO UPDATE SET amount_cents = EXCLUDED.amount_cents, created_at = now()`,
        [jobId, body.providerId, body.amountCents],
      );
    });
    return reply.status(201).send(await loadJob(db, jobId));
  });

  /** Customer picks a bid: that provider gets the job at their bid price; other bids are rejected. */
  app.post('/jobs/:id/bids/:bidId/accept', async (req) => {
    const params = z.object({ id, bidId: id }).parse(req.params);
    await tx(db, async (c) => {
      const job = await lockJob(c, params.id);
      requireStatus(job, 'OPEN');
      const bid = await one<{ providerId: string; amountCents: number }>(
        c,
        'SELECT provider_id, amount_cents FROM bids WHERE id = $1 AND job_id = $2',
        [params.bidId, params.id],
      );
      if (!bid) throw notFound('Bid');
      await requireEligibleProvider(c, bid.providerId, job);
      await c.query("UPDATE bids SET status = CASE WHEN id = $2 THEN 'ACCEPTED' ELSE 'REJECTED' END WHERE job_id = $1", [
        params.id,
        params.bidId,
      ]);
      await c.query("UPDATE jobs SET provider_id = $2, agreed_price_cents = $3, status = 'ASSIGNED' WHERE id = $1", [
        params.id,
        bid.providerId,
        bid.amountCents,
      ]);
    });
    return loadJob(db, params.id);
  });

  app.post('/jobs/:id/start', async (req) => {
    const { id: jobId } = idParam.parse(req.params);
    await tx(db, async (c) => {
      requireStatus(await lockJob(c, jobId), 'ASSIGNED');
      await c.query("UPDATE jobs SET status = 'IN_PROGRESS' WHERE id = $1", [jobId]);
    });
    return loadJob(db, jobId);
  });

  /** Completing a job creates its charge: customer price, company fee and provider payout. */
  app.post('/jobs/:id/complete', async (req) => {
    const { id: jobId } = idParam.parse(req.params);
    await tx(db, async (c) => {
      const job = await lockJob(c, jobId);
      requireStatus(job, 'IN_PROGRESS');
      if (!job.providerId || job.agreedPriceCents === null) throw conflict('Job has no provider or agreed price');
      const service = await getService(c, job.serviceTypeId);
      const rule = await resolveFeeRule(c, service, job.providerId);
      const charge = computeCharge(job.agreedPriceCents, rule);
      await c.query("UPDATE jobs SET status = 'COMPLETED', completed_at = now() WHERE id = $1", [jobId]);
      await c.query(
        `INSERT INTO charges (job_id, service_type_id, customer_id, provider_id, gross_cents, platform_fee_cents,
                              provider_payout_cents, fee_type, fee_bps, fee_fixed_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          jobId,
          job.serviceTypeId,
          job.customerId,
          job.providerId,
          charge.grossCents,
          charge.platformFeeCents,
          charge.providerPayoutCents,
          rule.type,
          rule.type === 'PERCENTAGE' ? rule.bps : 0,
          rule.type === 'FIXED' ? rule.cents : 0,
        ],
      );
    });
    return loadJob(db, jobId);
  });

  app.post('/jobs/:id/cancel', async (req) => {
    const { id: jobId } = idParam.parse(req.params);
    await tx(db, async (c) => {
      requireStatus(await lockJob(c, jobId), 'OPEN', 'ASSIGNED');
      await c.query("UPDATE jobs SET status = 'CANCELLED' WHERE id = $1", [jobId]);
      await c.query("UPDATE bids SET status = 'REJECTED' WHERE job_id = $1 AND status = 'PENDING'", [jobId]);
    });
    return loadJob(db, jobId);
  });
}
