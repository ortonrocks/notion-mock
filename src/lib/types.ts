export type PageRow = {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  content_json: string;
  plain_text: string;
  sort_order: number;
  version: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

export type Page = {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  content: unknown[];
  sortOrder: number;
  /** Bumped on every write. Send it back with an update to detect a conflict. */
  version: number;
  createdAt: number;
  updatedAt: number;
};

/** A page without its body, used for the sidebar tree. */
export type PageSummary = {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  sortOrder: number;
  updatedAt: number;
};

export type PageTreeNode = PageSummary & { children: PageTreeNode[] };

export type SearchHit = {
  id: string;
  title: string;
  icon: string | null;
  snippet: string;
};

/** A page sitting in the trash, with the size of what it took down with it. */
export type TrashEntry = {
  id: string;
  title: string;
  icon: string | null;
  deletedAt: number;
  /** How many nested pages were deleted along with this one. */
  descendants: number;
};
