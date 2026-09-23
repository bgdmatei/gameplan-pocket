import { createIgdbFromEnv } from '../catalog/igdb/create';
import { loadDotEnv, readEnv } from '../env';
import { consoleLogger } from '../logger';

/**
 * `pnpm --filter api igdb:smoke`: one real search with the keys in `.env`.
 * Manual, never in CI. Prints titles only.
 */
loadDotEnv();
const igdb = createIgdbFromEnv(readEnv(process.env), consoleLogger);
const games = await igdb.searchGames('witcher', 5);
console.warn(`IGDB answered with ${games.length} games:`);
for (const game of games)
  console.warn(`- ${game.name} (${game.id}), cover: ${game.coverImageId ?? 'none'}`);
