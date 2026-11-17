/**
 * Runs asynchronous tasks one at a time, in the order they were queued. A failed task doesn't stop the
 * tasks queued after it.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/**
 * Runs asynchronous tasks one at a time per key. Tasks with different keys run concurrently; the queue for
 * a key is dropped once it drains.
 */
export class KeyedSerialQueue {
  private readonly queues = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const result = previous.then(task, task);
    const settled = result.catch(() => undefined);
    this.queues.set(key, settled);
    void settled.then(() => {
      if (this.queues.get(key) === settled) this.queues.delete(key);
    });
    return result;
  }
}
