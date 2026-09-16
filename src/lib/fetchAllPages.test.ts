import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchAllPages, type PageResult } from "./fetchAllPages.ts";

/** A fake paginator: page N holds `["N-0", "N-1"]`, and each request resolves
 *  after `delays[page]` ticks so completion order can be forced out of order. */
function paginator(totalPages: number, delays: Record<number, number> = {}) {
  const started: number[] = [];
  let inFlight = 0;
  let peakInFlight = 0;

  const fetchPage = async (page: number): Promise<PageResult<string>> => {
    started.push(page);
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    const ticks = delays[page] ?? 0;
    for (let i = 0; i < ticks; i += 1) await Promise.resolve();
    inFlight -= 1;
    return {
      items: [`${page}-0`, `${page}-1`],
      lastPage: totalPages,
    };
  };

  return {
    fetchPage,
    started,
    get peakInFlight() {
      return peakInFlight;
    },
  };
}

describe("walking a paginated index", () => {
  it("returns every page's items in server order", async () => {
    const p = paginator(4);
    const items = await fetchAllPages(p.fetchPage, { maxPages: 10 });
    assert.deepEqual(items, [
      "1-0", "1-1", "2-0", "2-1", "3-0", "3-1", "4-0", "4-1",
    ]);
  });

  it("keeps server order even when later pages resolve first", async () => {
    // Page 2 is slow, page 4 is instant — completion order is 4, 3, 2.
    const p = paginator(4, { 2: 12, 3: 6 });
    const items = await fetchAllPages(p.fetchPage, { maxPages: 10 });
    assert.deepEqual(items, [
      "1-0", "1-1", "2-0", "2-1", "3-0", "3-1", "4-0", "4-1",
    ]);
  });

  it("runs pages concurrently instead of one at a time", async () => {
    const p = paginator(12, Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [i + 1, 4]),
    ));
    await fetchAllPages(p.fetchPage, { maxPages: 50, concurrency: 5 });
    assert.equal(p.peakInFlight > 1, true, "pages should overlap");
    assert.equal(p.peakInFlight <= 5, true, "must not exceed the pool size");
  });

  it("single-page responses do exactly one request", async () => {
    const p = paginator(1);
    const items = await fetchAllPages(p.fetchPage, { maxPages: 10 });
    assert.deepEqual(items, ["1-0", "1-1"]);
    assert.deepEqual(p.started, [1]);
  });

  it("stops at maxPages and never requests past it", async () => {
    const p = paginator(40);
    const items = await fetchAllPages(p.fetchPage, { maxPages: 3 });
    assert.equal(items.length, 6);
    assert.equal(Math.max(...p.started), 3);
  });

  it("onPage publishes only the contiguous prefix, growing monotonically", async () => {
    // Page 2 finishes last, so page 3/4 must NOT be published before it.
    const p = paginator(4, { 2: 20 });
    const snapshots: string[][] = [];
    await fetchAllPages(p.fetchPage, {
      maxPages: 10,
      concurrency: 4,
      onPage: (soFar) => snapshots.push([...soFar]),
    });

    assert.deepEqual(snapshots[0], ["1-0", "1-1"], "page 1 paints immediately");
    // Each snapshot extends the previous one — the list only ever grows.
    for (let i = 1; i < snapshots.length; i += 1) {
      const prev = snapshots[i - 1];
      assert.deepEqual(snapshots[i].slice(0, prev.length), prev);
      assert.equal(snapshots[i].length > prev.length, true);
    }
    assert.deepEqual(snapshots.at(-1)?.length, 8);
  });

  it("onPage reports page counts against the real total", async () => {
    const p = paginator(3);
    const seen: [number, number][] = [];
    await fetchAllPages(p.fetchPage, {
      maxPages: 10,
      onPage: (_items, loaded, total) => seen.push([loaded, total]),
    });
    assert.deepEqual(seen.at(-1), [3, 3]);
    assert.deepEqual(seen[0], [1, 3]);
  });

  it("a paginator that shrinks last_page mid-walk cannot loop", async () => {
    let call = 0;
    const fetchPage = async (page: number): Promise<PageResult<number>> => {
      call += 1;
      // Page 1 says 3 pages; later pages claim 99 — only page 1 is trusted.
      return { items: [page], lastPage: page === 1 ? 3 : 99 };
    };
    const items = await fetchAllPages(fetchPage, { maxPages: 50 });
    assert.deepEqual(items, [1, 2, 3]);
    assert.equal(call, 3);
  });

  it("a lastPage of 0 is treated as a single page", async () => {
    const fetchPage = async (): Promise<PageResult<number>> => ({
      items: [1],
      lastPage: 0,
    });
    assert.deepEqual(await fetchAllPages(fetchPage, { maxPages: 10 }), [1]);
  });
});
