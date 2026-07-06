import { ref } from 'vue';
import { CapacitorNfc } from '@capgo/capacitor-nfc';

// removeAllListeners() is provided at runtime by Capacitor's registerPlugin()
// base proxy for every plugin, but isn't part of this plugin's declared interface.
const NFC = CapacitorNfc as typeof CapacitorNfc & { removeAllListeners(): Promise<void> };

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
      // Check NFC is enabled on the device before scanning
      try {
        const status = await NFC.getStatus();
        if (status.status !== 'NFC_OK') {
          scanning.value = false;
          error.value = status.status === 'NFC_DISABLED'
            ? 'NFC is disabled. Please enable it in Settings.'
            : 'NFC is not available on this device.';
          throw new Error(error.value);
        }
      } catch (e: any) {
        if (e.message === error.value) throw e; // re-throw our own error
        // getStatus itself failed — proceed anyway
      }

      return new Promise(async (resolve, reject) => {
        // Must await addListener before startScanning to avoid missing the event
        await NFC.addListener('nfcEvent', (event: any) => {
          const tagId = event?.tag?.id;

          let uid: string;
          if (Array.isArray(tagId)) {
            uid = tagId.map((b: number) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
          } else {
            uid = String(tagId ?? '').replace(/:/g, '').toUpperCase();
          }

          scannedUid.value = uid;
          scanning.value   = false;
          NFC.removeAllListeners();
          NFC.stopScanning();
          resolve(uid);
        }).catch((err: any) => {
          scanning.value = false;
          error.value    = err?.message ?? 'Failed to register NFC listener';
          reject(err);
        });

        NFC.startScanning({ invalidateAfterFirstRead: true }).catch((err: any) => {
          scanning.value = false;
          error.value    = err?.message ?? 'NFC scan failed';
          reject(err);
        });
      });
    }

    // No NFC hardware in a plain browser — there's nothing to scan.
    scanning.value = false;
    error.value    = 'NFC scanning requires the mobile app. Enter the card UID manually instead.';
    throw new Error(error.value);
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
