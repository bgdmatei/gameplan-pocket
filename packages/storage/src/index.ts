export type {
  NodeAdapterOptions,
  SqlParams,
  SqlValue,
  StorageAdapter,
  Transaction,
  Unsubscribe,
} from './adapter';
export { createNodeAdapter } from './node/adapter';
export { tablesWritten } from './sql-tables';

export {
  LIBRARY_ENTRY_TABLES,
  getLibraryEntry,
  getLibraryEntryByGame,
  listLibraryEntries,
  saveLibraryEntry,
  softDeleteLibraryEntry,
} from './repositories/library-entries';
export type {
  LibraryEntryWithGame,
  LibraryPage,
  LibrarySort,
  ListLibraryOptions,
  SaveOptions,
} from './repositories/library-entries';
export { writeAtomically } from './repositories/write';
export type { AtomicWrite, PendingOp, Row, RowWrite } from './repositories/write';

export {
  ENTRY_TAG_TABLES,
  addEntryTag,
  listEntryTags,
  listTagsInUse,
  removeEntryTag,
} from './repositories/entry-tags';
export type { TagSaveOptions } from './repositories/entry-tags';
export {
  NOTE_ITEM_TABLES,
  countOpenNotes,
  getNoteItem,
  listNoteItems,
  saveNoteItem,
  softDeleteNoteItem,
} from './repositories/note-items';
export type { ListNoteOptions, NoteSaveOptions } from './repositories/note-items';
export {
  LIST_TABLES,
  addGameToList,
  getList,
  listGamesOf,
  listItemsOf,
  listLists,
  removeGameFromList,
  saveList,
  softDeleteList,
} from './repositories/lists';
export type { ListSaveOptions } from './repositories/lists';

export {
  CATALOG_TABLES,
  getGame,
  getGamesByIds,
  pruneCatalog,
  searchGames,
  upsertGames,
} from './repositories/games';
export type { PruneOptions, SearchOptions, UpsertGamesInput } from './repositories/games';

export {
  PENDING_OP_TABLES,
  appendPendingOp,
  countPendingOps,
  deletePendingOps,
  listPendingOps,
} from './repositories/pending-ops';
export type { ListPendingOptions } from './repositories/pending-ops';
export { SYNC_STATE_TABLES, getSyncState, updateSyncState } from './repositories/sync-state';
export type { SyncState, SyncStatePatch } from './repositories/sync-state';
