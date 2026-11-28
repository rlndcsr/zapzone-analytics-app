/**
 * One in-flight attempt per key, per owner — the duplicate-confirmation guard
 * used by the refund and booking-restore flows (spec 002, FR-023).
 *
 *  • The lock is taken synchronously, before `fn` is called, so two confirm
 *    callbacks in the same tick start only one request.
 *  • A held key refuses only the SAME owner. The screens pass the session that
 *    started the attempt, so an unresolved request from an earlier or expired
 *    session (one that `apiRequest` leaves pending forever) never blocks the
 *    session that is signed in now.
 *  • Each hold has a ticket; settling releases the key only if that ticket
 *    still holds it, so an old session finishing late can't free a newer lock.
 *
 * This is client-side duplicate-submission protection only — it says nothing
 * about concurrent requests on the server.
 */
export type SingleFlight = {
  /** Runs `fn` unless `owner` already holds `key`; resolves `null` when refused. */
  run<T>(key: string, owner: unknown, fn: () => Promise<T>): Promise<T | null>;
  /** Whether `owner` currently holds `key`. */
  isRunning(key: string, owner: unknown): boolean;
};

export function createSingleFlight(): SingleFlight {
  const held = new Map<string, { owner: unknown; ticket: number }>();
  let nextTicket = 0;

  return {
    run<T>(key: string, owner: unknown, fn: () => Promise<T>): Promise<T | null> {
      const current = held.get(key);
      if (current && current.owner === owner) return Promise.resolve(null);

      const ticket = ++nextTicket;
      held.set(key, { owner, ticket });
      const release = () => {
        if (held.get(key)?.ticket === ticket) held.delete(key);
      };

      let pending: Promise<T>;
      try {
        pending = fn();
      } catch (err) {
        release();
        return Promise.reject(err);
      }
      return pending.finally(release);
    },

    isRunning(key: string, owner: unknown): boolean {
      const current = held.get(key);
      return !!current && current.owner === owner;
    },
  };
}
