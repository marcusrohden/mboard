/**
 * Maps `items` through an asynchronous function with at most `limit` calls in flight, keeping the input
 * order in the result. Bounding file reads keeps the app well under the open-file limit of apps launched
 * from Finder.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await map(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
