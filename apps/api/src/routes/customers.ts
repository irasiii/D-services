import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { many, one, type Db } from '../db.js';
import { notFound } from '../errors.js';
import { idParam } from '../schemas.js';

const customerCreate = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(320).transform((e) => e.toLowerCase()),
  phone: z.string().trim().max(40).optional(),
});

export async function customerRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.post('/customers', async (req, reply) => {
    const body = customerCreate.parse(req.body);
    const customer = await one(db, 'INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING *', [
      body.name,
      body.email,
      body.phone ?? null,
    ]);
    return reply.status(201).send(customer);
  });

  app.get('/customers', async () => many(db, 'SELECT * FROM customers ORDER BY created_at DESC LIMIT 200'));

  app.get('/customers/:id', async (req) => {
    const { id } = idParam.parse(req.params);
    const customer = await one(db, 'SELECT * FROM customers WHERE id = $1', [id]);
    if (!customer) throw notFound('Customer');
    return customer;
  });

  for (const [action, status] of [['block', 'BLOCKED'], ['unblock', 'ACTIVE']] as const) {
    app.post(`/customers/:id/${action}`, async (req) => {
      const { id } = idParam.parse(req.params);
      const customer = await one(db, 'UPDATE customers SET status = $2 WHERE id = $1 RETURNING *', [id, status]);
      if (!customer) throw notFound('Customer');
      return customer;
    });
  }
}
