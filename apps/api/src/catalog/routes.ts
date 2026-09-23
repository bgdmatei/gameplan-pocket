import { Hono } from 'hono';
import { z } from 'zod';
import type { CatalogService } from './service';
import { normaliseQuery } from './service';

const MAX_BATCH = 100;

const searchSchema = z.object({
  q: z.string().transform(normaliseQuery).pipe(z.string().min(2).max(100)),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** A positive integer written as digits only: no signs, decimals or exponents. */
const idSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .transform(Number);

const idsSchema = z
  .string()
  .transform((text) => text.split(','))
  .pipe(z.array(idSchema).min(1).max(MAX_BATCH))
  .transform((ids) => [...new Set(ids)]);

/** Names the fields that failed, never what was sent. */
const invalid = (fields: readonly string[]) => ({ error: 'invalid_request', fields });

const fieldsOf = (error: z.ZodError): string[] => [
  ...new Set(error.issues.map((issue) => String(issue.path[0] ?? 'request'))),
];

/**
 * The catalog's HTTP surface. Responses use the domain's own shapes, so a
 * client parses them with the schemas it already has. IGDB failing never
 * shows up as an error here: the service answers from cache with `stale`.
 */
export const createCatalogRoutes = (service: CatalogService): Hono => {
  const routes = new Hono();

  routes.get('/search', async (c) => {
    const input = searchSchema.safeParse(c.req.query());
    if (!input.success) return c.json(invalid(fieldsOf(input.error)), 400);
    return c.json(await service.search(input.data.q, input.data.limit));
  });

  routes.get('/games', async (c) => {
    const ids = idsSchema.safeParse(c.req.query('ids') ?? '');
    if (!ids.success) return c.json(invalid(['ids']), 400);
    return c.json(await service.getGames(ids.data));
  });

  routes.get('/games/:id', async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json(invalid(['id']), 400);

    const { game, stale } = await service.getGame(id.data);
    if (game === null) return c.json({ error: 'not_found', stale }, 404);
    return c.json({ game, stale });
  });

  routes.get('/reference', async (c) => c.json(await service.getReference()));

  return routes;
};
