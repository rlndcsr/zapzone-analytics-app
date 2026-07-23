// Cross-screen refresh flag: the Membership Details screen marks the list stale
// after a mutation; the list consumes it on focus and refetches.
let stale = false;

export const markMembershipsStale = (): void => {
  stale = true;
};

export const consumeMembershipsStale = (): boolean => {
  const was = stale;
  stale = false;
  return was;
};
