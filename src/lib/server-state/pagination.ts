export type NextPageParamResolver<TPage, TPageParam> = (
  lastPage: TPage,
  allPages: readonly TPage[],
) => TPageParam | null | undefined;

export function createNextPageParam<TPage, TPageParam>(
  resolve: NextPageParamResolver<TPage, TPageParam>,
) {
  return (
    lastPage: TPage,
    allPages: readonly TPage[],
  ): TPageParam | undefined => resolve(lastPage, allPages) ?? undefined;
}

export function appendPage<TPage>(
  pages: readonly TPage[],
  page: TPage,
): readonly TPage[] {
  return [...pages, page];
}

export function flattenPages<TPage, TItem>(
  pages: readonly TPage[],
  selectItems: (page: TPage) => readonly TItem[],
): readonly TItem[] {
  return pages.flatMap((page) => [...selectItems(page)]);
}
