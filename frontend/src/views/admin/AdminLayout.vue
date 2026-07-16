<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet />
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="dashboard" href="/admin/dashboard">
          <ion-icon :icon="homeOutline" />
          <ion-label>Dashboard</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="students" href="/admin/students">
          <ion-icon :icon="peopleOutline" />
          <ion-label>Students</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="analytics" href="/admin/analytics">
          <ion-icon :icon="statsChartOutline" />
          <ion-label>Analytics</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="cards" href="/admin/cards">
          <ion-icon :icon="wifiOutline" />
          <ion-label>Cards</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="staff" href="/admin/staff">
          <ion-icon :icon="briefcaseOutline" />
          <ion-label>Staff</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import { IonPage, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonRouterOutlet } from '@ionic/vue';
import { homeOutline, peopleOutline, statsChartOutline, wifiOutline, briefcaseOutline } from 'ionicons/icons';
</script>

<style scoped>
ion-page { --background: var(--sp-bg); }
</style>
