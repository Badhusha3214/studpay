<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet />
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="wallet" href="/app/wallet">
          <ion-icon :icon="walletOutline" />
          <ion-label>Wallet</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="history" href="/app/history">
          <ion-icon :icon="listOutline" />
          <ion-label>History</ion-label>
        </ion-tab-button>

        <!-- Admin-only tabs -->
        <ion-tab-button v-if="auth.isAdmin" tab="nfc" href="/app/nfc">
          <ion-icon :icon="wifiOutline" />
          <ion-label>NFC Tags</ion-label>
        </ion-tab-button>

        <ion-tab-button v-if="auth.isAdmin" tab="students" href="/app/students">
          <ion-icon :icon="peopleOutline" />
          <ion-label>Students</ion-label>
        </ion-tab-button>

        <ion-tab-button v-if="auth.isAdmin" tab="admin" href="/app/admin">
          <ion-icon :icon="settingsOutline" />
          <ion-label>Admin</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonPage, IonTabs, IonTabBar, IonTabButton,
  IonIcon, IonLabel, IonRouterOutlet,
} from '@ionic/vue';
import {
  walletOutline, listOutline,
  wifiOutline, peopleOutline, settingsOutline,
} from 'ionicons/icons';
import { useAuthStore } from '@/store/auth';

const auth = useAuthStore();
</script>
