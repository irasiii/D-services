import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { many, one, tx, type Db, type Queryable } from '../db.js';
import { notFound } from '../errors.js';
import { feeColumns, feeRule, idParam, vehicleClass } from '../schemas.js';

const serviceId = z.string().regex(/^[a-z][a-z0-9-]{1,30}$/);

const vehicle = z.object({
  vehicleClass,
  registration: z.string().trim().max(20).optional(),
  capacityKg: z.number().int().min(0).max(200_000).optional(),
});

const providerCreate = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(320).transform((e) => e.toLowerCase()),
  phone: z.string().trim().max(40).optional(),
  businessNumber: z.string().trim().max(40).optional(),
  licenceNumber: z.string().trim().min(1).max(40),
  licenceClass: z.string().trim().min(1).max(10),
  vehicles: z.array(vehicle).min(1).max(50),
  serviceIds: z.array(serviceId).min(1).max(20),
});

export async function loadProvider(q: Queryable, id: string) {
  const provider = await one(q, 'SELECT * FROM providers WHERE id = $1', [id]);
  if (!provider) return undefined;
  const vehicles = await many(q, 'SELECT * FROM vehicles WHERE provider_id = $1 ORDER BY vehicle_class', [id]);
  const services = await many(
    q,
    'SELECT service_type_id, fee_type, fee_bps, fee_fixed_cents FROM provider_services WHERE provider_id = $1 ORDER BY service_type_id',
    [id],
  );
  return { ...provider, vehicles, services };
}

export async function providerRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /** A provider registers with their licence, vehicles (any size) and the services they offer. */
  app.post('/providers', async (req, reply) => {
    const body = providerCreate.parse(req.body);
    const provider = await tx(db, async (c) => {
      const row = await one<{ id: string }>(
        c,
        `INSERT INTO providers (name, email, phone, business_number, licence_number, licence_class)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [body.name, body.email, body.phone ?? null, body.businessNumber ?? null, body.licenceNumber, body.licenceClass],
      );
      const providerId = row!.id;
      for (const v of body.vehicles) {
        await c.query(
          'INSERT INTO vehicles (provider_id, vehicle_class, registration, capacity_kg) VALUES ($1, $2, $3, $4)',
          [providerId, v.vehicleClass, v.registration ?? null, v.capacityKg ?? null],
        );
      }
      for (const sid of new Set(body.serviceIds)) {
        await c.query('INSERT INTO provider_services (provider_id, service_type_id) VALUES ($1, $2)', [providerId, sid]);
      }
      return loadProvider(c, providerId);
    });
    return reply.status(201).send(provider);
  });

  app.get('/providers', async (req) => {
    const { status } = z.object({ status: z.enum(['PENDING', 'APPROVED', 'SUSPENDED']).optional() }).parse(req.query);
    return many(
      db,
      `SELECT p.*,
              COALESCE((SELECT array_agg(DISTINCT v.vehicle_class) FROM vehicles v WHERE v.provider_id = p.id), '{}') AS vehicle_classes,
              COALESCE((SELECT array_agg(ps.service_type_id) FROM provider_services ps WHERE ps.provider_id = p.id), '{}') AS service_ids
       FROM providers p
       WHERE ($1::text IS NULL OR p.status = $1)
       ORDER BY p.created_at DESC LIMIT 200`,
      [status ?? null],
    );
  });

  app.get('/providers/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const provider = await loadProvider(db, id);
    if (!provider) throw notFound('Provider');
    return provider;
  });

  /** Company approves a provider after checking licence and vehicle, or suspends them. */
  for (const [action, status] of [['approve', 'APPROVED'], ['suspend', 'SUSPENDED']] as const) {
    app.post(`/providers/:id/${action}`, async (req) => {
      const { id } = idParam.parse(req.params);
      const row = await one(db, 'UPDATE providers SET status = $2 WHERE id = $1 RETURNING id', [id, status]);
      if (!row) throw notFound('Provider');
      return loadProvider(db, id);
    });
  }

  /**
   * Enrol a provider in a service, optionally with a negotiated fee for this provider.
   * `fee: null` (or omitted) means the service's default fee applies.
   */
  app.put('/providers/:id/services/:serviceId', async (req) => {
    const params = z.object({ id: z.uuid(), serviceId }).parse(req.params);
    const body = z.object({ fee: feeRule.nullable().optional() }).parse(req.body ?? {});
    const fee = body.fee ? feeColumns(body.fee) : undefined;
    if (!(await one(db, 'SELECT id FROM providers WHERE id = $1', [params.id]))) throw notFound('Provider');
    if (!(await one(db, 'SELECT id FROM service_types WHERE id = $1', [params.serviceId]))) throw notFound('Service');
    await db.query(
      `INSERT INTO provider_services (provider_id, service_type_id, fee_type, fee_bps, fee_fixed_cents)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (provider_id, service_type_id)
       DO UPDATE SET fee_type = EXCLUDED.fee_type, fee_bps = EXCLUDED.fee_bps, fee_fixed_cents = EXCLUDED.fee_fixed_cents`,
      [params.id, params.serviceId, fee?.feeType ?? null, fee?.feeBps ?? null, fee?.feeFixedCents ?? null],
    );
    return loadProvider(db, params.id);
  });
}
