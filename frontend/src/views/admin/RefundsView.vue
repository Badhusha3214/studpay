<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="router.push('/admin/dashboard')">
            <ion-icon :icon="arrowBackOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
        <ion-title>Refund Requests</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div v-if="processing" class="processing-overlay">
        <ion-spinner name="crescent" color="light" />
      </div>

      <div class="sp-card fade-up filter-card">
        <div class="status-tabs">
          <button class="status-tab" :class="{ active: status === 'refund_pending' }" @click="status = 'refund_pending'; load()">Pending</button>
          <button class="status-tab" :class="{ active: status === 'refunded' }" @click="status = 'refunded'; load()">Refunded</button>
        </div>
      </div>

      <p class="sp-section-title">{{ refunds.length }} request{{ refunds.length === 1 ? '' : 's' }}</p>

      <div v-if="loading" class="center"><ion-spinner name="crescent" color="primary" /></div>

      <div v-else-if="refunds.length === 0" class="empty-state">
        <ion-icon :icon="cashOutline" />
        <p>No {{ status === 'refund_pending' ? 'pending' : 'refunded' }} requests</p>
      </div>

      <div v-else class="refunds-list">
        <div v-for="r in refunds" :key="r.id" class="refund-card fade-up">
          <div class="refund-header">
            <div>
              <p class="refund-student">{{ r.student_name }} <span class="refund-class">{{ r.class }}</span></p>
              <p class="refund-shop">{{ r.shop_name }} &middot; {{ formatDate(r.created_at) }}</p>
            </div>
            <p class="refund-amount">₹{{ Number(r.amount).toFixed(0) }}</p>
          </div>
          <p class="refund-items">{{ itemsSummary(r.items) }}</p>
          <p class="refund-reason">Reason: {{ r.refund_reason }}</p>

          <div v-if="status === 'refund_pending'" class="refund-actions">
            <button class="refund-btn approve" @click="approve(r)">
              <ion-icon :icon="checkmarkOutline" /> Approve
            </button>
            <button class="refund-btn deny" @click="reject(r)">
              <ion-icon :icon="closeOutline" /> Deny
            </button>
          </div>
          <p v-else class="refunded-at">Refunded {{ formatDate(r.refunded_at) }}</p>
        </div>
      </div>

      <div style="height: 24px" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent, alertController,
} from '@ionic/vue';
import { arrowBackOutline, cashOutline, checkmarkOutline, closeOutline } from 'ionicons/icons';
import api from '@/composables/useApi';

interface RefundOrder {
  id: string; student_name: string; class: string; shop_name: string;
  items: { name: string; quantity: number }[]; amount: number;
  status: string; refund_reason: string; created_at: string; refunded_at: string | null;
}

const router = useRouter();

const refunds    = ref<RefundOrder[]>([]);
const loading    = ref(false);
const processing = ref(false);
const status     = ref<'refund_pending' | 'refunded'>('refund_pending');

function itemsSummary(items: RefundOrder['items']) {
  return (items || []).map((i) => `${i.name} x${i.quantity}`).join(', ');
}

function formatDate(dt: string | null) {
  if (!dt) return '';
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/refunds', { params: { status: status.value } });
    refunds.value = data;
  } finally {
    loading.value = false;
  }
}

async function refresh(event: any) { await load(); event.target.complete(); }

async function approve(r: RefundOrder) {
  const alert = await alertController.create({
    header: 'Approve Refund',
    message: `Credit ₹${r.amount.toFixed(0)} back to ${r.student_name}'s wallet?`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Approve', handler: async () => {
          processing.value = true;
          try { await api.patch(`/admin/refunds/${r.id}/approve`); await load(); }
          finally { processing.value = false; }
        },
      },
    ],
  });
  await alert.present();
}

async function reject(r: RefundOrder) {
  const alert = await alertController.create({
    header: 'Deny Refund',
    inputs: [{ name: 'reason', type: 'text', placeholder: 'Reason (optional)' }],
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Deny', role: 'destructive', handler: async (vals) => {
          processing.value = true;
          try { await api.patch(`/admin/refunds/${r.id}/reject`, { reason: vals.reason || undefined }); await load(); }
          finally { processing.value = false; }
        },
      },
    ],
  });
  await alert.present();
}

onMounted(load);
</script>

<style scoped>
.processing-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
}
.filter-card { padding: 8px; }
.status-tabs { display: flex; gap: 6px; }
.status-tab {
  flex: 1; border: none; background: var(--sp-bg); cursor: pointer;
  padding: 9px 0; border-radius: 10px; font-size: 12px; font-weight: 700;
  color: var(--sp-subtext);
}
.status-tab.active { background: var(--sp-purple); color: white; }

.refunds-list { padding: 4px 0; }
.refund-card {
  background: white; border-radius: 16px;
  margin: 6px 14px; padding: 14px;
  box-shadow: var(--sp-shadow);
}
.refund-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.refund-student { font-size: 14px; font-weight: 700; margin: 0; color: var(--sp-text); }
.refund-class { font-size: 11px; font-weight: 600; color: var(--sp-subtext); }
.refund-shop { font-size: 12px; color: var(--sp-subtext); margin: 3px 0 0; }
.refund-amount { font-size: 15px; font-weight: 800; color: var(--sp-text); margin: 0; flex-shrink: 0; }
.refund-items { font-size: 12px; color: var(--sp-subtext); margin: 8px 0 0; }
.refund-reason { font-size: 12px; color: var(--sp-text); margin: 4px 0 0; font-style: italic; }

.refund-actions { display: flex; gap: 8px; margin-top: 12px; }
.refund-btn {
  flex: 1; border: none; border-radius: 10px; padding: 10px 0;
  font-size: 13px; font-weight: 700; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 4px;
}
.refund-btn.approve { background: var(--sp-teal-light); color: var(--sp-teal); }
.refund-btn.deny    { background: var(--sp-orange-light); color: var(--sp-orange); }
.refunded-at { font-size: 11px; color: var(--sp-subtext); margin: 8px 0 0; font-weight: 600; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 48px 16px; gap: 10px; color: var(--sp-subtext); font-size: 14px; }
.empty-state ion-icon { font-size: 52px; opacity: 0.4; }
.center { display: flex; justify-content: center; padding: 32px; }
</style>
