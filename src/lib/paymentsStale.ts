// Cross-screen refresh flag (mirrors markContactsStale): the Deleted Payments
// screen marks the payment list stale after a restore or a permanent delete;
// Manage Payments consumes it on focus and refetches, so going back shows the
// restored payment without a manual pull-to-refresh.
let stale = false;

export const markPaymentsStale = (): void => {
  stale = true;
};

export const consumePaymentsStale = (): boolean => {
  const was = stale;
  stale = false;
  return was;
};
