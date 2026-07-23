// Cross-screen refresh flag (mirrors markAttractionsStale/markPackagesStale):
// the Edit Customer screen marks the list stale on save; the list consumes it
// on focus and refetches, so returning shows the saved changes without a manual
// pull-to-refresh.
let stale = false;

export const markContactsStale = (): void => {
  stale = true;
};

export const consumeContactsStale = (): boolean => {
  const was = stale;
  stale = false;
  return was;
};
