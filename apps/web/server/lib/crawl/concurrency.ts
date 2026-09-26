/** Limit upstream/DB work while keeping the result order deterministic. */
export async function mapConcurrent<T, R>(items: readonly T[], limit: number, action: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const settled = await Promise.allSettled(Array.from({ length: Math.min(items.length, Math.max(1, Math.floor(limit))) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await action(items[index]!);
    }
  }));
  const failed = settled.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return results;
}
