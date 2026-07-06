<template>
  <ion-app :class="{ 'cashier-mode': isCashierRoute }">
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { IonApp, IonRouterOutlet } from '@ionic/vue';

const route = useRoute();
const isCashierRoute = computed(() =>
  ['/pay', '/pin', '/receipt', '/dashboard'].includes(route.path)
);
</script>
