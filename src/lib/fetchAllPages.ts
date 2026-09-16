/**
 * Walking a paginated index without doing it one request at a time.
 *
 * Every "load the whole list" helper in `services/` used to be a `do/while`
 * that awaited page N before asking for page N+1. That makes the wall-clock
 * cost `pages × round-trip`: the customers screen alone walks ~35 pages of 200
 * contacts, so at a ~2.8s round trip it sat on a spinner for over 90 seconds
 * while the device did nothing but wait.
 *
 * The pages after the first are independent — only page 1 has to come back
 * before we know how many there are — so they can be in flight together. This
 * runs a fixed-size pool over pages 2..last, which turns those 35 serial trips
 * into ~6 waves and cuts the load to a few seconds.
 *
 * Why a pool rather than `Promise.all` over every page: a phone on mobile data
 * has a handful of usable sockets, and firing 100 requests at once (the
 * bookings sync cap) queues them in the networking stack anyway while giving
 * the backend a thundering herd. A small pool keeps the pipe full without
 * either problem.
 */

/** Pages in flight at once. Enough to saturate a mobile connection, low enough
 *  not to stampede the API — raise per-call only for a known-cheap endpoint. */
export const PAGE_CONCURRENCY = 6;

/** One page's worth of a paginated response, normalised by the caller. */
export type PageResult<T> = {
  items: T[];
  /** Total page count reported by the API (`pagination.last_page`). */
  lastPage: number;
};

export type FetchAllPagesOptions<T> = {
  /**
   * Runaway guard — the ceiling each service already declared (`MAX_PAGES`,
   * `SYNC_MAX_PAGES`, …). Pages past it are not fetched.
   */
  maxPages: number;
  concurrency?: number;
  /**
   * Called as each page lands, with everything gathered SO FAR in server order,
   * so a screen can paint the first rows instead of waiting for the last page.
   * Fires only for pages that extend the contiguous run from page 1, so the
   * list only ever grows and never reorders under the user.
   */
  onPage?: (itemsSoFar: T[], pagesLoaded: number, totalPages: number) => void;
};

/**
 * Every item across every page, in server order.
 *
 * `fetchPage` receives a 1-indexed page number and returns that page's items
 * plus the API's `last_page`. Only the page-1 result's `lastPage` decides how
 * far to walk, so a paginator that changes its mind mid-walk can't loop.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<PageResult<T>>,
  { maxPages, concurrency = PAGE_CONCURRENCY, onPage }: FetchAllPagesOptions<T>,
): Promise<T[]> {
  const first = await fetchPage(1);
  const lastPage = Math.min(Math.max(first.lastPage || 1, 1), maxPages);

  if (lastPage <= 1) {
    onPage?.(first.items, 1, 1);
    return first.items;
  }

  // Slots are filled by page index, not by completion order, so the result
  // keeps the sort the server applied no matter which request wins the race.
  const pages: (T[] | undefined)[] = new Array(lastPage);
  pages[0] = first.items;

  // How far the contiguous run from page 1 reaches — only that prefix is safe
  // to hand to `onPage`, since anything past a gap would reorder once the
  // missing page arrives. Starts at 0 so the first `emit()` publishes page 1.
  let contiguous = 0;
  const emit = () => {
    if (!onPage) return;
    let advanced = false;
    while (contiguous < lastPage && pages[contiguous] !== undefined) {
      contiguous += 1;
      advanced = true;
    }
    if (advanced) {
      onPage(pages.slice(0, contiguous).flat() as T[], contiguous, lastPage);
    }
  };
  emit();

  let next = 2;
  const worker = async () => {
    for (;;) {
      const page = next++;
      if (page > lastPage) return;
      pages[page - 1] = (await fetchPage(page)).items;
      emit();
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, lastPage - 1) }, worker),
  );

  return pages.flat() as T[];
}
