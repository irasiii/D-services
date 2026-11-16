import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { many, one, type Db } from '../db.js';
import { notFound } from '../errors.js';
import { id, idParam } from '../schemas.js';

export async function chargeRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/charges', async (req) => {
    const q = z
      .object({ providerId: id.optional(), customerId: id.optional(), status: z.enum(['PENDING', 'PAID']).optional() })
      .parse(req.query);
    return many(
      db,
      `SELECT * FROM charges
       WHERE ($1::uuid IS NULL OR provider_id = $1)
         AND ($2::uuid IS NULL OR customer_id = $2)
         AND ($3::text IS NULL OR status = $3)
       ORDER BY created_at DESC LIMIT 500`,
      [q.providerId ?? null, q.customerId ?? null, q.status ?? null],
    );
  });

  /** Company revenue per service: jobs charged, customer spend, company fees, provider payouts. */
  app.get('/charges/summary', async () => {
    const byService = await many(
      db,
      `SELECT service_type_id,
              count(*)::int AS jobs,
              COALESCE(sum(gross_cents), 0)::int AS gross_cents,
              COALESCE(sum(platform_fee_cents), 0)::int AS platform_fee_cents,
              COALESCE(sum(provider_payout_cents), 0)::int AS provider_payout_cents
       FROM charges GROUP BY service_type_id ORDER BY service_type_id`,
    );
    const sum = (key: string) => byService.reduce((acc, row) => acc + Number(row[key]), 0);
    return {
      byService,
      total: {
        jobs: sum('jobs'),
        grossCents: sum('grossCents'),
        platformFeeCents: sum('platformFeeCents'),
        providerPayoutCents: sum('providerPayoutCents'),
      },
    };
  });

  /** Record that the charge was settled. No payment gateway is connected yet. */
  app.post('/charges/:id/mark-paid', async (req) => {
    const { id: chargeId } = idParam.parse(req.params);
    const charge = await one(
      db,
      "UPDATE charges SET status = 'PAID', paid_at = COALESCE(paid_at, now()) WHERE id = $1 RETURNING *",
      [chargeId],
    );
    if (!charge) throw notFound('Charge');
    return charge;
  });
}
