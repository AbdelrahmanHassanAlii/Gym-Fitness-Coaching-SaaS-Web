export interface OpaqueCursorPageInfo {
  hasMore?: boolean;
  nextCursor?: string | null;
}

export interface OpaqueCursorPage<TItem> {
  data: TItem[];
  pageInfo?: OpaqueCursorPageInfo;
  page?: {
    nextCursor: string | null;
  };
  meta?: OpaqueCursorPageInfo;
}

export interface CursorListQuery {
  cursor?: string;
  limit?: number;
}

export interface CategoryBoundCursorQuery {
  category?: string;
  cursor?: string;
  limit?: number;
}
