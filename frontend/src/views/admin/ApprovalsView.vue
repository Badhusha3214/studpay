<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="router.push('/admin/dashboard')">
            <ion-icon :icon="arrowBackOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
        <ion-title>Parent Approvals</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div class="sp-card fade-up filter-card">
        <div class="status-tabs">
          <button
            v-for="opt in statusOptions" :key="opt.value"
            class="status-tab" :class="{ active: status === opt.value }"
            @click="status = opt.value; load()"
          >{{ opt.label }}</button>
        </div>
      </div>

      <p class="sp-section-title">{{ approvals.length }} hold{{ approvals.length === 1 ? '' : 's' }}</p>

      <div v-if="loading" class="center"><ion-spinner name="crescent" color="primary" /></div>

      <div v-else-if="approvals.length === 0" class="empty-state">
        <ion-icon :icon="timeOutline" />
        <p>No approval holds</p>
      </div>

      <div v-else class="approvals-list">
        <div v-for="a in approvals" :key="a.id" class="approval-card fade-up">
          <div class="approval-header">
            <div>
              <p class="approval-student">{{ a.student_name }} <span class="approval-class">{{ a.class }}</span></p>
              <p class="approval-desc">{{ a.description }}{{ a.shop_name ? ` · ${a.shop_name}` : '' }}</p>
            </div>
            <p class="approval-amount">₹{{ Number(a.amount).toFixed(0) }}</p>
          </div>
          <div class="approval-footer">
            <span class="badge" :class="`status-${a.status}`">{{ statusLabel(a.status) }}</span>
            <span class="queue-time">In queue: {{ formatDuration(a.timeInQueueMs) }}</span>
          </div>
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
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent,
} from '@ionic/vue';
import { arrowBackOutline, timeOutline } from 'ionicons/icons';
import api from '@/composables/useApi';

interface Approval {
  id: string; student_name: string; class: string; amount: number; description: string;
  status: 'pending' | 'approved' | 'rejected'; shop_name: string | null; timeInQueueMs: number;
}

const router = useRouter();

const approvals = ref<Approval[]>([]);
const loading   = ref(false);
const status    = ref('pending');

const statusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

function statusLabel(s: string) {
  if (s === 'approved') return 'Approved (timed out)';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/approvals', { params: { status: status.value === 'all' ? undefined : status.value } });
    approvals.value = data;
  } finally {
    loading.value = false;
  }
}

async function refresh(event: any) { await load(); event.target.complete(); }

onMounted(load);
</script>

<style scoped>
.filter-card { padding: 8px; }
.status-tabs { display: flex; gap: 6px; }
.status-tab {
  flex: 1; border: none; background: var(--sp-bg); cursor: pointer;
  padding: 9px 0; border-radius: 10px; font-size: 12px; font-weight: 700;
  color: var(--sp-subtext);
}
.status-tab.active { background: var(--sp-purple); color: white; }

.approvals-list { padding: 4px 0; }
.approval-card {
  background: white; border-radius: 16px;
  margin: 6px 14px; padding: 14px;
  box-shadow: var(--sp-shadow);
}
.approval-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.approval-student { font-size: 14px; font-weight: 700; margin: 0; color: var(--sp-text); }
.approval-class { font-size: 11px; font-weight: 600; color: var(--sp-subtext); }
.approval-desc { font-size: 12px; color: var(--sp-subtext); margin: 3px 0 0; }
.approval-amount { font-size: 15px; font-weight: 800; color: var(--sp-text); margin: 0; flex-shrink: 0; }

.approval-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--sp-border); }
.queue-time { font-size: 11px; color: var(--sp-subtext); font-weight: 600; }

.badge { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 100px; }
.badge.status-pending  { background: var(--sp-yellow); color: #7a5c00; }
.badge.status-approved { background: var(--sp-teal-light); color: var(--sp-teal); }
.badge.status-rejected { background: var(--sp-orange-light); color: var(--sp-orange); }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 48px 16px; gap: 10px; color: var(--sp-subtext); font-size: 14px; }
.empty-state ion-icon { font-size: 52px; opacity: 0.4; }
.center { display: flex; justify-content: center; padding: 32px; }
</style>
