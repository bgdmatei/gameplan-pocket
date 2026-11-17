import type { StorageAdapter } from '@gameplan/storage';
import type { CoverStore } from '@/data/cover-store';

/** One sync's share, so a 5,000-game library fills over many syncs (#27). */
export const COVERS_PER_SYNC = 50;

/**
 * The cover ids of every game in the library, archived included, most
 * recently edited first, so the games being played fill before the backlog.
 */
export const libraryCoverIds = async (adapter: StorageAdapter): Promise<string[]> => {
  const rows = await adapter.execute<{ imageId: string }>(
    `SELECT g.cover_image_id AS imageId
       FROM library_entries e JOIN games g ON g.id = e.game_id
      WHERE e.deleted = 0 AND g.cover_image_id IS NOT NULL
      GROUP BY g.cover_image_id
      ORDER BY max(e.updated_at) DESC`,
  );
  return rows.map((row) => row.imageId);
};

/** Missing covers to fetch, capped; stored covers no library game uses any more. */
export const planCovers = (
  wanted: readonly string[],
  stored: ReadonlySet<string>,
  cap: number = COVERS_PER_SYNC,
): { download: string[]; remove: string[] } => {
  const keep = new Set(wanted);
  return {
    download: wanted.filter((id) => !stored.has(id)).slice(0, cap),
    remove: [...stored].filter((id) => !keep.has(id)),
  };
};

/**
 * A failed download is left for the next sync. `keepGoing` is asked before
 * each download, so a sign-out or a switch to cellular stops the batch.
 */
export const fillCovers = async (
  adapter: StorageAdapter,
  store: CoverStore,
  keepGoing: () => Promise<boolean>,
): Promise<void> => {
  const { download, remove } = planCovers(await libraryCoverIds(adapter), store.stored());
  for (const id of remove) store.remove(id);
  for (const id of download) {
    if (!(await keepGoing())) return;
    await store.download(id).catch(() => undefined);
  }
};
