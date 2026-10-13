export function staffDeleteMessage(err: unknown, fallback: string): string {
  const status = (err as { status?: unknown } | null)?.status;
  const message = err instanceof Error ? err.message.trim() : "";
  return typeof status === "number" && status >= 400 && status < 500 && message
    ? message
    : fallback;
}
