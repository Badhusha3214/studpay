import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.studpay.cashier',
  appName: 'StudPay Cashier',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
