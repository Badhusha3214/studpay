<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Dashboard</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="logout">
            <ion-icon :icon="logOutOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div v-if="loading" class="center"><ion-spinner name="crescent" color="primary" /></div>

      <template v-else-if="data">
        <div class="stats-grid fade-up">
          <div class="stat-card" style="--sc:#6C63FF;--scl:#EDE9FF">
            <p class="sc-val">₹{{ data.totalWalletBalance.toFixed(0) }}</p>
            <p class="sc-lbl">Total Wallet Balance</p>
          </div>
          <div class="stat-card" style="--sc:#00C9A7;--scl:#D6FBF5">
            <p class="sc-val">₹{{ data.todayTransactionAmount.toFixed(0) }}</p>
            <p class="sc-lbl">Today's Sales ({{ data.todayTransactionCount }})</p>
          </div>
          <div class="stat-card" style="--sc:#FFD166;--scl:#FFF6E0">
            <p class="sc-val">{{ data.activeCards }} / {{ data.activeCards + data.inactiveCards }}</p>
            <p class="sc-lbl">Active Cards</p>
          </div>
          <div class="stat-card clickable" style="--sc:#FF6B6B;--scl:#FFE8E8" @click="router.push('/admin/approvals')">
            <p class="sc-val">{{ data.pendingApprovals }}</p>
            <p class="sc-lbl">Pending Approvals</p>
          </div>
        </div>

        <p class="sp-section-title">Manage</p>
        <div class="links-list fade-up">
          <button class="link-row" @click="router.push('/admin/shops')">
            <div class="link-icon"><ion-icon :icon="storefrontOutline" /></div>
            <div class="link-info">
              <p class="link-title">Shops</p>
              <p class="link-sub">Add and manage canteen/shop locations</p>
            </div>
            <ion-icon :icon="chevronForwardOutline" class="chevron" />
          </button>
          <button class="link-row" @click="router.push('/admin/approvals')">
            <div class="link-icon"><ion-icon :icon="timeOutline" /></div>
            <div class="link-info">
              <p class="link-title">Parent Approvals</p>
              <p class="link-sub">Pending, timed-out and rejected purchase holds</p>
            </div>
            <ion-icon :icon="chevronForwardOutline" class="chevron" />
          </button>
          <button class="link-row" @click="router.push('/admin/reports')">
            <div class="link-icon"><ion-icon :icon="documentTextOutline" /></div>
            <div class="link-info">
              <p class="link-title">Reports</p>
              <p class="link-sub">Spending report + emergency fund usage, CSV export</p>
            </div>
            <ion-icon :icon="chevronForwardOutline" class="chevron" />
          </button>
          <button class="link-row" @click="router.push('/admin/refunds')">
            <div class="link-icon"><ion-icon :icon="cashOutline" /></div>
            <div class="link-info">
              <p class="link-title">Refund Requests</p>
              <p class="link-sub">Approve or deny cashier-initiated refunds</p>
            </div>
            <ion-icon :icon="chevronForwardOutline" class="chevron" />
          </button>
        </div>
      </template>

      <div style="height: 24px" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent,
} from '@ionic/vue';
import {
  logOutOutline, storefrontOutline, timeOutline, documentTextOutline,
  cashOutline, chevronForwardOutline,
} from 'ionicons/icons';
import api from '@/composables/useApi';
import { useAuthStore } from '@/store/auth';

interface Dashboard {
  totalWalletBalance: number;
  totalEmergencyBalance: number;
  todayTransactionCount: number;
  todayTransactionAmount: number;
  activeCards: number;
  inactiveCards: number;
  pendingApprovals: number;
}

const router = useRouter();
const auth   = useAuthStore();

const loading = ref(false);
const data    = ref<Dashboard | null>(null);

async function load() {
  loading.value = true;
  try {
    const { data: res } = await api.get('/admin/dashboard');
    data.value = res;
  } finally {
    loading.value = false;
  }
}

async function refresh(event: any) { await load(); event.target.complete(); }

function logout() { auth.logout(); router.replace('/login'); }

onMounted(load);
</script>

<style scoped>
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 16px; }
.stat-card { background: var(--scl); border-radius: 18px; padding: 16px; display: flex; flex-direction: column; gap: 4px; }
.stat-card.clickable { cursor: pointer; }
.sc-val { font-size: 20px; font-weight: 800; color: var(--sc); margin: 0; overflow-wrap: anywhere; }
.sc-lbl { font-size: 12px; color: var(--sp-subtext); margin: 0; font-weight: 600; }

.links-list { padding: 0 16px; display: flex; flex-direction: column; gap: 10px; }
.link-row {
  display: flex; align-items: center; gap: 12px;
  background: white; border: none; border-radius: 16px;
  padding: 14px; box-shadow: var(--sp-shadow);
  cursor: pointer; text-align: left; width: 100%;
}
.link-icon {
  width: 42px; height: 42px; border-radius: 12px;
  background: var(--sp-purple-light); color: var(--sp-purple);
  display: flex; align-items: center; justify-content: center;
  font-size: 19px; flex-shrink: 0;
}
.link-info { flex: 1; min-width: 0; }
.link-title { font-size: 14px; font-weight: 700; margin: 0; color: var(--sp-text); }
.link-sub { font-size: 12px; color: var(--sp-subtext); margin: 2px 0 0; }
.chevron { color: var(--sp-subtext); flex-shrink: 0; }

.center { display: flex; justify-content: center; padding: 32px; }
</style>
