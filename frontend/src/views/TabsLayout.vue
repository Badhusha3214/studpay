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
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonPage, IonTabs, IonTabBar, IonTabButton,
  IonIcon, IonLabel, IonRouterOutlet,
} from '@ionic/vue';
import { walletOutline, listOutline } from 'ionicons/icons';
</script>
