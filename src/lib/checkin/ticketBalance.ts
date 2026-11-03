export function confirmedTicketBalance(ticket: {
  status: string;
  totalAmount: number;
  amountPaid: number;
  amountPaidRecorded?: boolean;
}): number {
  if (ticket.status !== "confirmed" || !ticket.amountPaidRecorded) return 0;
  const balance =
    Math.round((ticket.totalAmount - ticket.amountPaid) * 100) / 100;
  return balance > 0.005 ? balance : 0;
}
