import { ref } from 'vue';
// @ts-ignore — aliased to nfc-stub.ts on web via vite.config.ts
import { NFC } from '@capgo/capacitor-nfc';

export function useNfc() {
  const scanning   = ref(false);
  const scannedUid = ref('');
  const error      = ref('');

  const isCapacitor = typeof (window as any).Capacitor !== 'undefined' &&
                      (window as any).Capacitor.isNativePlatform?.();

  async function startScan(): Promise<string> {
    scanning.value   = true;
    error.value      = '';
    scannedUid.value = '';

    if (isCapacitor) {
      return new Promise((resolve, reject) => {
        NFC.addListener('nfcEvent', (event: any) => {
          const tagId = event?.tag?.id;

          // tag id can be a byte array or a hex string
          let uid: string;
          if (Array.isArray(tagId)) {
            uid = tagId.map((b: number) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
          } else {
            uid = String(tagId ?? '').toUpperCase();
          }

          scannedUid.value = uid;
          scanning.value   = false;
          NFC.removeAllListeners();
          NFC.stopScanning();
          resolve(uid);
        });

        NFC.startScanning({ invalidateAfterFirstRead: true }).catch((err: any) => {
          scanning.value = false;
          error.value    = err?.message ?? 'NFC scan failed';
          reject(err);
        });
      });
    }

    // Web simulation — 2 second delay
    return new Promise((resolve) => {
      setTimeout(() => {
        const uid        = 'A1B2C3D4';
        scannedUid.value = uid;
        scanning.value   = false;
        resolve(uid);
      }, 2000);
    });
  }

  async function stopScan() {
    scanning.value = false;
    if (isCapacitor) {
      await NFC.stopScanning().catch(() => {});
      await NFC.removeAllListeners();
    }
  }

  return { scanning, scannedUid, error, startScan, stopScan };
}
