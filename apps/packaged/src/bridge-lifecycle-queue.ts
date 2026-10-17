/** One owner changes sidecars at a time; all quit paths await the same cleanup. */
export function createBridgeLifecycleQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  let closing: Promise<unknown> | undefined;
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  };
  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      if (closing) return Promise.reject(new Error('Bridge is shutting down.'));
      return enqueue(operation);
    },
    close(cleanup: () => Promise<unknown>): Promise<unknown> {
      return closing ??= enqueue(cleanup);
    },
  };
}
