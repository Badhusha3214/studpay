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

        <ion-tab-button v-if="auth.isParent" tab="insights" href="/app/insights">
          <ion-icon :icon="statsChartOutline" />
          <ion-label>Insights</ion-label>
        </ion-tab-button>

        <ion-tab-button v-if="auth.isParent" tab="manage" href="/app/manage">
          <ion-icon :icon="peopleOutline" />
          <ion-label>Manage</ion-label>
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
import { walletOutline, listOutline, peopleOutline, statsChartOutline } from 'ionicons/icons';
import { useAuthStore } from '@/store/auth';

const auth = useAuthStore();
</script>
