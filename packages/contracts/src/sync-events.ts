import { z } from 'zod';

/** The only event on `/sync/events` (ADR-011). Strict, so nothing else can ride along. */
export const POKE_EVENT = 'poke';

export const pokeSchema = z.strictObject({ seq: z.number().int().nonnegative() });

export type Poke = z.infer<typeof pokeSchema>;
