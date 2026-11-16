import { coverUrl } from '@gameplan/domain';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Library covers kept on the phone (#27): `cover_big` files in the documents
 * folder, which iOS never purges, unlike the image cache. The folder is the
 * record of what is stored; it is listed once, then kept in memory.
 */
const folder = new Directory(Paths.document, 'covers');

/** IGDB image ids are short alphanumerics; anything else never becomes a path. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const fileOf = (imageId: string): File => new File(folder, `${imageId}.jpg`);

let stored: Set<string> | null = null;
/** Bumped by each clear, so a download that was in flight discards its file. */
let generation = 0;

const storedSet = (): Set<string> => {
  if (stored === null) {
    stored = new Set(
      folder.exists
        ? folder
            .list()
            .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.jpg'))
            .map((file) => file.name.slice(0, -'.jpg'.length))
        : [],
    );
  }
  return stored;
};

export const storedCovers = (): ReadonlySet<string> => storedSet();

/** The stored file for this cover, or null to load it from IGDB. */
export const localCoverUri = (imageId: string | null): string | null =>
  imageId !== null && storedSet().has(imageId) ? fileOf(imageId).uri : null;

export const downloadCover = async (imageId: string): Promise<void> => {
  const url = coverUrl(imageId, 'cover_big');
  if (url === null || !SAFE_ID.test(imageId)) return;
  const started = generation;
  folder.create({ idempotent: true, intermediates: true });
  // Under a temporary name until complete: the folder listing only counts .jpg.
  const partial = new File(folder, `${imageId}.part`);
  const file = await File.downloadFileAsync(url, partial, { idempotent: true });
  if (started !== generation || !(file.size !== null && file.size > 0)) {
    if (file.exists) file.delete();
    return;
  }
  await file.move(fileOf(imageId), { overwrite: true });
  storedSet().add(imageId);
};

export const removeCover = (imageId: string): void => {
  if (!SAFE_ID.test(imageId)) return;
  const file = fileOf(imageId);
  if (file.exists) file.delete();
  storedSet().delete(imageId);
};

/** Signing out takes the covers too: what someone plays is personal. */
export const clearCovers = (): void => {
  generation += 1;
  if (folder.exists) folder.delete();
  stored = new Set();
};

export type CoverStore = {
  stored: () => ReadonlySet<string>;
  download: (imageId: string) => Promise<void>;
  remove: (imageId: string) => void;
};

export const coverStore: CoverStore = {
  stored: storedCovers,
  download: downloadCover,
  remove: removeCover,
};
