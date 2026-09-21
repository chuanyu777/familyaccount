export function createLatestGate() {
  let sequence = 0;
  return {
    async run<T>(loader: () => Promise<T>) {
      const request = ++sequence;
      const value = await loader();
      return { current: request === sequence, value };
    },
  };
}
