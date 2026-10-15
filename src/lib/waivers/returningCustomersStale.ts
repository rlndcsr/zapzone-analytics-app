// Cross-screen refresh flag (mirrors markContactsStale): a change on a customer
// record marks the Returning Customers list stale; the list consumes it on
// focus and re-reads its page — the web's `onChanged={load}`.
let stale = false;

export const markReturningCustomersStale = (): void => {
  stale = true;
};

export const consumeReturningCustomersStale = (): boolean => {
  const was = stale;
  stale = false;
  return was;
};
