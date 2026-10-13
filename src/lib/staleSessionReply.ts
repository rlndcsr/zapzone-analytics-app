export const isStaleSessionReply = (
  sentToken: string | undefined,
  currentToken: string | null,
): boolean => !!sentToken && sentToken !== currentToken;
