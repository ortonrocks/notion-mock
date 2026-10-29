/**
 * The database layer's public surface.
 *
 * Everything used to live in one `src/lib/db.ts`. It is split by concern now,
 * but callers still import from `@/lib/db`, so the split stays invisible to
 * the rest of the app.
 */
export { db } from "./connection";
export {
  VersionConflictError,
  createPage,
  deletePage,
  ensureSeeded,
  getAncestors,
  getPage,
  isDescendant,
  listFavorites,
  listPages,
  listRecent,
  listTree,
  movePage,
  setFavorite,
  searchPages,
  updatePage,
} from "./pages";
export { deleteSetting, getSetting, setSetting } from "./settings";
export { NotATrashRootError, emptyTrash, listTrash, purgePage, restorePage } from "./trash";
export { hasOrderCollision, orderBetween, rebalanceSiblings } from "./ordering";
