export const NFC = {
  addListener:        (_event: string, _cb: any) => Promise.resolve({ remove: () => {} }),
  removeAllListeners: () => Promise.resolve(),
  startScanning:      async (_opts?: any) => {},
  stopScanning:       async () => {},
};
