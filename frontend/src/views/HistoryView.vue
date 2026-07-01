<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Transaction History</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <!-- Summary strip -->
      <div class="summary-strip fade-up">
        <div class="summary-item">
          <ion-icon :icon="arrowUpOutline" class="s-icon debit" />
          <div>
            <p class="s-label">Total Spent</p>
            <p class="s-val debit">₹{{ totalSpent.toFixed(2) }}</p>
          </div>
        </div>
        <div class="summary-divider" />
        <div class="summary-item">
          <ion-icon :icon="arrowDownOutline" class="s-icon credit" />
          <div>
            <p class="s-label">Total Topped Up</p>
            <p class="s-val credit">₹{{ totalCredit.toFixed(2) }}</p>
          </div>
        </div>
      </div>

      <!-- Filter tabs -->
      <div class="filter-tabs">
        <div
          v-for="f in filters"
          :key="f.key"
          class="filter-tab"
          :class="{ active: activeFilter === f.key }"
          @click="activeFilter = f.key"
        >
          {{ f.label }}
        </div>
      </div>

      <div v-if="loading" class="center">
        <ion-spinner name="crescent" color="primary" />
      </div>

      <div v-else-if="filtered.length === 0" class="empty-state">
        <ion-icon :icon="receiptOutline" />
        <p>No transactions found</p>
      </div>

      <div v-else>
        <div
          v-for="txn in filtered"
          :key="txn.id"
          class="txn-card fade-up"
        >
          <div class="txn-left">
            <div class="txn-icon" :class="txn.type">
              <ion-icon :icon="txn.type === 'credit' ? arrowDownOutline : arrowUpOutline" />
            </div>
            <div>
              <p class="txn-desc">{{ txn.description }}</p>
              <p class="txn-meta">{{ txn.merchant }}</p>
              <p class="txn-date">{{ formatDateTime(txn.created_at) }}</p>
            </div>
          </div>
          <div class="txn-right">
            <span class="txn-amount" :class="txn.type">
              {{ txn.type === 'credit' ? '+' : '-' }}₹{{ txn.amount.toFixed(2) }}
            </span>
            <span class="sp-chip" :class="txn.type">
              {{ txn.type === 'credit' ? 'Credit' : 'Debit' }}
            </span>
          </div>
        </div>
      </div>

      <div style="height: 20px" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent,
} from '@ionic/vue';
import { arrowUpOutline, arrowDownOutline, receiptOutline } from 'ionicons/icons';
import api from '@/composables/useApi';

const loading      = ref(false);
const transactions = ref<any[]>([]);
const activeFilter = ref('all');

const filters = [
  { key: 'all',    label: 'All' },
  { key: 'debit',  label: 'Payments' },
  { key: 'credit', label: 'Top-Ups' },
];

const filtered = computed(() =>
  activeFilter.value === 'all'
    ? transactions.value
    : transactions.value.filter(t => t.type === activeFilter.value)
);

const totalSpent  = computed(() => transactions.value.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0));
const totalCredit = computed(() => transactions.value.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0));

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/wallet/history');
    transactions.value = data;
  } finally {
    loading.value = false;
  }
}

async function refresh(event: any) {
  await load();
  event.target.complete();
}

function formatDateTime(dt: string) {
  return new Date(dt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

onMounted(load);
</script>

<style scoped>
.summary-strip {
  display: flex; align-items: center;
  background: white;
  border-radius: 20px;
  margin: 16px;
  padding: 16px 20px;
  box-shadow: var(--sp-shadow);
}
.summary-item {
  flex: 1; display: flex; align-items: center; gap: 10px;
}
.s-icon { font-size: 24px; }
.s-icon.debit  { color: var(--sp-orange); }
.s-icon.credit { color: var(--sp-teal); }
.s-label { font-size: 11px; color: var(--sp-subtext); margin: 0; }
.s-val   { font-size: 17px; font-weight: 800; margin: 2px 0 0; }
.s-val.debit  { color: var(--sp-orange); }
.s-val.credit { color: var(--sp-teal); }
.summary-divider { width: 1px; height: 36px; background: var(--sp-border); margin: 0 16px; }

.filter-tabs {
  display: flex; gap: 8px; padding: 0 16px 12px;
}
.filter-tab {
  padding: 6px 18px; border-radius: 100px;
  font-size: 13px; font-weight: 600;
  background: white; color: var(--sp-subtext);
  cursor: pointer; border: 2px solid transparent;
}
.filter-tab.active {
  background: var(--sp-purple-light);
  color: var(--sp-purple);
  border-color: var(--sp-purple);
}

.txn-card {
  display: flex; align-items: center; justify-content: space-between;
  background: white;
  margin: 6px 16px;
  padding: 14px 16px;
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.txn-left { display: flex; align-items: center; gap: 12px; }
.txn-icon {
  width: 42px; height: 42px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; flex-shrink: 0;
}
.txn-icon.credit { background: var(--sp-teal-light);  color: var(--sp-teal); }
.txn-icon.debit  { background: var(--sp-orange-light); color: var(--sp-orange); }
.txn-desc  { font-size: 14px; font-weight: 600; margin: 0; }
.txn-meta  { font-size: 12px; color: var(--sp-subtext); margin: 2px 0 0; }
.txn-date  { font-size: 11px; color: var(--sp-subtext); margin: 2px 0 0; }
.txn-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.txn-amount { font-size: 15px; font-weight: 800; }
.txn-amount.credit { color: var(--sp-teal); }
.txn-amount.debit  { color: var(--sp-orange); }

.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 48px 16px; gap: 8px; color: var(--sp-subtext); font-size: 14px;
}
.empty-state ion-icon { font-size: 48px; opacity: 0.4; }
.center { display: flex; justify-content: center; padding: 32px; }
</style>
