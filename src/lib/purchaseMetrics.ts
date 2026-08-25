export type TransactionCountable = { ticketOrderId: number | null };

export function countTransactions(
  records: readonly TransactionCountable[],
): number {
  const orderIds = new Set<number>();
  let standalone = 0;

  for (const record of records) {
    if (!record.ticketOrderId) standalone += 1;
    else orderIds.add(record.ticketOrderId);
  }

  return standalone + orderIds.size;
}
