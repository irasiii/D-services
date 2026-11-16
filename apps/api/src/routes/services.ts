import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { many, one, type Db } from '../db.js';
import { notFound } from '../errors.js';
import { cents, feeColumns, feeRule } from '../schemas.js';

const serviceParam = z.object({ id: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/) });

const serviceUpdate = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500),
    pricingMode: z.enum(['PLATFORM', 'BIDDING']),
    fee: feeRule,
    baseFareCents: cents,
    perKmCents: cents,
    minFareCents: cents,
    active: z.boolean(),
  })
  .partial();

export async function serviceRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/services', async () => many(db, 'SELECT * FROM service_types ORDER BY name'));

  app.get('/services/:id', async (req) => {
    const { id } = serviceParam.parse(req.params);
    const service = await one(db, 'SELECT * FROM service_types WHERE id = $1', [id]);
    if (!service) throw notFound('Service');
    return service;
  });

  /** Company changes how a service is priced and what it charges (percentage or fixed fee). */
  app.patch('/services/:id', async (req) => {
    const { id } = serviceParam.parse(req.params);
    const body = serviceUpdate.parse(req.body);
    const fee = body.fee ? feeColumns(body.fee) : undefined;
    const service = await one(
      db,
      `UPDATE service_types SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         pricing_mode = COALESCE($4, pricing_mode),
         fee_type = COALESCE($5, fee_type),
         fee_bps = COALESCE($6, fee_bps),
         fee_fixed_cents = COALESCE($7, fee_fixed_cents),
         base_fare_cents = COALESCE($8, base_fare_cents),
         per_km_cents = COALESCE($9, per_km_cents),
         min_fare_cents = COALESCE($10, min_fare_cents),
         active = COALESCE($11, active)
       WHERE id = $1 RETURNING *`,
      [
        id,
        body.name ?? null,
        body.description ?? null,
        body.pricingMode ?? null,
        fee?.feeType ?? null,
        fee?.feeBps ?? null,
        fee?.feeFixedCents ?? null,
        body.baseFareCents ?? null,
        body.perKmCents ?? null,
        body.minFareCents ?? null,
        body.active ?? null,
      ],
    );
    if (!service) throw notFound('Service');
    return service;
  });
}
