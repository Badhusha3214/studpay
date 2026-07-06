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

    <!-- Junk-food purchase awaiting approval — reject-only; if left alone it
         auto-approves once the timeout elapses (see wallet.js/pay-by-nfc). -->
    <div v-if="current" class="approval-overlay">
      <div class="approval-card fade-up">
        <ion-icon :icon="alertCircleOutline" class="approval-icon" />
        <p class="approval-title">{{ current.studentName }} wants to buy:</p>
        <p class="approval-desc">{{ current.description }}</p>
        <p class="approval-amount">₹{{ current.amount.toFixed(2) }}</p>
        <p class="approval-countdown">Auto-approves in {{ secondsLeft }}s</p>
        <ion-button expand="block" class="reject-btn" :disabled="rejecting" @click="reject(current.id)">
          <ion-spinner v-if="rejecting" name="crescent" />
          <span v-else>Reject</span>
        </ion-button>
      </div>
    </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  IonPage, IonTabs, IonTabBar, IonTabButton,
  IonIcon, IonLabel, IonRouterOutlet, IonButton, IonSpinner,
} from '@ionic/vue';
import { walletOutline, listOutline, peopleOutline, statsChartOutline, alertCircleOutline } from 'ionicons/icons';
import { useAuthStore } from '@/store/auth';
import api from '@/composables/useApi';

interface PendingApproval {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  description: string;
  expiresAt: string;
}

const auth = useAuthStore();

const pendingApprovals = ref<PendingApproval[]>([]);
const current   = computed(() => pendingApprovals.value[0] ?? null);
const rejecting = ref(false);
const now       = ref(Date.now());

const secondsLeft = computed(() => {
  if (!current.value) return 0;
  return Math.max(0, Math.ceil((new Date(current.value.expiresAt).getTime() - now.value) / 1000));
});

let pollTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;

async function loadPendingApprovals() {
  try {
    const { data } = await api.get('/parent/pending-approvals');
    pendingApprovals.value = data;
  } catch { /* keep showing the last known state on a transient error */ }
}

async function reject(id: string) {
  rejecting.value = true;
  try {
    await api.post(`/parent/pending-approvals/${id}/reject`);
    await loadPendingApprovals();
  } finally {
    rejecting.value = false;
  }
}

onMounted(() => {
  if (!auth.isParent) return;
  loadPendingApprovals();
  pollTimer  = setInterval(loadPendingApprovals, 5000);
  clockTimer = setInterval(() => { now.value = Date.now(); }, 1000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (clockTimer) clearInterval(clockTimer);
});
</script>

<style scoped>
.approval-overlay {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.approval-card {
  background: white; border-radius: 24px; padding: 32px 24px;
  width: 100%; max-width: 340px; text-align: center;
}
.approval-icon { font-size: 44px; color: var(--sp-orange); }
.approval-title  { font-size: 14px; color: var(--sp-subtext); margin: 12px 0 0; }
.approval-desc   { font-size: 18px; font-weight: 800; color: var(--sp-text); margin: 6px 0 0; }
.approval-amount { font-size: 28px; font-weight: 800; color: var(--sp-purple); margin: 6px 0 0; }
.approval-countdown { font-size: 12px; color: var(--sp-subtext); margin: 10px 0 20px; }
.reject-btn { --background: var(--sp-orange); --border-radius: 14px; height: 50px; font-weight: 700; }
</style>
