import { writeFile } from 'node:fs/promises';
import { createIgdbFromEnv } from '../catalog/igdb/create';
import { loadDotEnv, readEnv } from '../env';
import { consoleLogger } from '../logger';

const TOTAL = 1_000;
const PAGE = 500;
const TARGET = new URL(
  '../../../../packages/storage/src/testing/fixtures/catalog.json',
  import.meta.url,
);

/**
 * `pnpm --filter api capture:games`: fetches IGDB's 1,000 most-rated games,
 * with the genres and platforms they refer to, into the storage seed's
 * fixture. Manual, never in CI. Four requests.
 *
 * Summaries are dropped: nothing the seed measures reads them, and they are
 * most of the file's size. Sorted by id, so a re-capture diffs cleanly; run
 * Prettier on the file afterwards (`pnpm exec prettier --write <file>`).
 */
loadDotEnv();
const igdb = createIgdbFromEnv(readEnv(process.env), consoleLogger);

const captured = [];
for (let offset = 0; offset < TOTAL; offset += PAGE) {
  captured.push(...(await igdb.getPopularGames(offset, PAGE)));
}
const games = [...new Map(captured.map((game) => [game.id, { ...game, summary: null }])).values()];
games.sort((a, b) => a.id - b.id);

// Only the genres and platforms these games use: the seed stores what it references.
const genreIds = new Set(games.flatMap((game) => game.genreIds));
const platformIds = new Set(games.flatMap((game) => game.platformIds));
const genres = (await igdb.getGenres()).filter((genre) => genreIds.has(genre.id));
const platforms = (await igdb.getPlatforms()).filter((platform) => platformIds.has(platform.id));

await writeFile(TARGET, `${JSON.stringify({ genres, platforms, games }, null, 2)}\n`);
console.warn(
  `Captured ${games.length} games, ${genres.length} genres, ${platforms.length} platforms.`,
);
