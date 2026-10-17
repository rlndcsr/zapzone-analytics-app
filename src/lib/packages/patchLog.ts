/**
 * Local changes to rows (a status or online switch) kept until a fetch that
 * began after them has come back. A quiet refresh already in flight answers
 * with the old values; replaying the newer changes over it keeps the switch
 * from being undone (web parity: PackageCacheService changesDuringSync, 4d165ce).
 */
export function createPatchLog<T extends { id: number }>() {
  let seq = 0;
  const pending = new Map<number, { seq: number; changes: Partial<T> }>();

  return {
    /** Remember a change made just now; later changes to the same row merge in. */
    record(id: number, changes: Partial<T>): void {
      pending.set(id, { seq: ++seq, changes: { ...pending.get(id)?.changes, ...changes } });
    },
    /** Take before starting a fetch; hand it to {@link replay} with the answer. */
    mark(): number {
      return seq;
    },
    /** The fetched rows with every change made since `since`; older ones are dropped as already applied. */
    replay(rows: T[], since: number): T[] {
      const result = rows.map((row) => {
        const change = pending.get(row.id);
        return change && change.seq > since ? { ...row, ...change.changes } : row;
      });
      for (const [id, change] of pending) {
        if (change.seq <= since) pending.delete(id);
      }
      return result;
    },
  };
}
