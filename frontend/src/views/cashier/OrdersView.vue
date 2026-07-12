<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="router.push('/pay')">
            <ion-icon :icon="arrowBackOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
        <ion-title>Orders</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="logout">
            <ion-icon :icon="logOutOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="processing" class="processing-overlay">
        <ion-spinner name="crescent" color="light" />
      </div>

      <ion-refresher slot="fixed" @ionRefresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div v-if="stats" class="summary-strip fade-up">
        <div class="summary-stat">
          <p class="summary-val">₹{{ stats.todayRevenue.toFixed(0) }}</p>
          <p class="summary-lbl">Today's Sales</p>
        </div>
        <div class="summary-stat">
          <p class="summary-val">{{ stats.todayTransactions }}</p>
          <p class="summary-lbl">Transactions</p>
        </div>
        <div class="summary-stat">
          <p class="summary-val">{{ stats.pendingApprovals }}</p>
          <p class="summary-lbl">Pending Approval</p>
        </div>
      </div>

      <div class="c-card fade-up filter-card">
        <input v-model="q" placeholder="Search by student name" class="c-search-input" @input="debouncedReset" />
        <div class="status-chips">
          <button
            v-for="opt in statusOptions" :key="opt.value"
            class="status-chip" :class="{ active: status === opt.value }"
            @click="status = opt.value; reset()"
          >{{ opt.label }}</button>
        </div>
        <div class="date-row">
          <input v-model="from" type="date" class="c-search-input date-input" @change="reset" />
          <input v-model="to" type="date" class="c-search-input date-input" @change="reset" />
        </div>
        <button class="export-btn" :disabled="exporting" @click="exportCsv">
          <ion-icon :icon="downloadOutline" />
          {{ exporting ? 'Exporting…' : 'Export CSV' }}
        </button>
      </div>

      <p class="section-title">{{ orders.length }} order{{ orders.length === 1 ? '' : 's' }}</p>

      <div v-if="loading" class="center"><ion-spinner name="crescent" color="primary" /></div>

      <div v-else-if="orders.length === 0" class="empty-state">
        <ion-icon :icon="receiptOutline" />
        <p>No orders yet</p>
      </div>

      <div v-else class="orders-list">
        <div v-for="order in orders" :key="order.id" class="order-card fade-up">
          <div class="order-header">
            <div class="order-student">
              <p class="order-student-name">{{ order.student_name }}</p>
              <p class="order-student-meta">{{ order.class }}</p>
            </div>
            <div class="order-total-wrap">
              <p class="order-total">₹{{ Number(order.amount).toFixed(2) }}</p>
              <p class="order-date">{{ formatDate(order.created_at) }}</p>
            </div>
          </div>
          <div class="order-lines">
            <div v-for="(line, i) in order.items" :key="i" class="order-line">
              <span>{{ line.name }} &times;{{ line.quantity }}</span>
              <span>₹{{ Number(line.lineAmount).toFixed(2) }}</span>
            </div>
          </div>
          <div class="order-footer">
            <span class="badge" :class="`status-${order.status}`">{{ statusLabel(order.status) }}</span>
            <button v-if="order.status === 'completed'" class="refund-link" @click="requestRefund(order)">
              Request Refund
            </button>
            <span v-else-if="order.status === 'refund_pending'" class="refund-note">Awaiting admin approval</span>
          </div>
        </div>

        <ion-infinite-scroll v-if="nextCursor" @ionInfinite="loadMore">
          <ion-infinite-scroll-content loading-spinner="crescent" />
        </ion-infinite-scroll>
      </div>

      <div style="height: 24px" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent,
  IonInfiniteScroll, IonInfiniteScrollContent, alertController,
} from '@ionic/vue';
import { arrowBackOutline, logOutOutline, receiptOutline, downloadOutline } from 'ionicons/icons';
import api from '@/composables/useApi';
import { useAuthStore } from '@/store/auth';

interface OrderItem { itemId: string | null; name: string; quantity: number; lineAmount: number; }
interface Order {
  id: string; student_id: string; student_name: string; class: string;
  items: OrderItem[]; amount: number; status: string;
  refund_reason: string | null; refunded_at: string | null; created_at: string;
}
interface Stats { todayRevenue: number; todayTransactions: number; pendingApprovals: number; }

const POLL_INTERVAL_MS = 8000;

const router = useRouter();
const auth   = useAuthStore();

const orders      = ref<Order[]>([]);
const nextCursor  = ref<string | null>(null);
const loading     = ref(false);
const processing  = ref(false);
const exporting   = ref(false);
const stats       = ref<Stats | null>(null);

const q      = ref('');
const status = ref('');
const from   = ref('');
const to     = ref('');

const statusOptions = [
  { value: '', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending_approval', label: 'Pending' },
  { value: 'refund_pending', label: 'Refund Pending' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'rejected', label: 'Rejected' },
];

function statusLabel(s: string) {
  return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatDate(dt: string) {
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function queryParams(cursor?: string | null) {
  return {
    q: q.value || undefined,
    status: status.value || undefined,
    from: from.value || undefined,
    to: to.value ? `${to.value}T23:59:59` : undefined,
    cursor: cursor || undefined,
  };
}

async function loadStats() {
  const { data } = await api.get('/shop/stats');
  stats.value = data;
}

// Full reload from page 1 — used on filter change and pull-to-refresh.
async function reset() {
  loading.value = true;
  try {
    const { data } = await api.get('/shop/orders', { params: queryParams() });
    orders.value = data.orders;
    nextCursor.value = data.nextCursor;
  } finally {
    loading.value = false;
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedReset() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(reset, 300);
}

async function loadMore(event: any) {
  const { data } = await api.get('/shop/orders', { params: queryParams(nextCursor.value) });
  orders.value.push(...data.orders);
  nextCursor.value = data.nextCursor;
  event.target.complete();
}

// Live-update poll: re-fetches page 1 under the current filters and merges
// it into the already-loaded list (update-in-place for known orders, prepend
// for new ones) without disturbing further pages the cashier has scrolled to.
async function poll() {
  try {
    const { data } = await api.get('/shop/orders', { params: queryParams() });
    const known = new Map(orders.value.map((o) => [o.id, o]));
    const fresh: Order[] = [];
    for (const o of data.orders as Order[]) {
      if (known.has(o.id)) {
        Object.assign(known.get(o.id)!, o);
      } else {
        fresh.push(o);
      }
    }
    if (fresh.length > 0) orders.value = [...fresh, ...orders.value];
    await loadStats();
  } catch {
    // Silent — a missed poll tick isn't worth surfacing to the cashier.
  }
}

async function refresh(event: any) {
  await Promise.all([reset(), loadStats()]);
  event.target.complete();
}

async function requestRefund(order: Order) {
  const alert = await alertController.create({
    header: 'Request Refund',
    message: `Request a refund of ₹${Number(order.amount).toFixed(0)} for ${order.student_name}? A school admin must approve it.`,
    inputs: [{ name: 'reason', type: 'text', placeholder: 'Reason for refund' }],
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Request', handler: async (vals) => {
          if (!vals.reason || !String(vals.reason).trim()) return false;
          processing.value = true;
          try {
            await api.patch(`/shop/orders/${order.id}/refund`, { reason: vals.reason });
            await reset();
          } finally {
            processing.value = false;
          }
          return true;
        },
      },
    ],
  });
  await alert.present();
}

async function exportCsv() {
  exporting.value = true;
  try {
    const { data } = await api.get('/shop/orders/export', { params: queryParams(), responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    exporting.value = false;
  }
}

function logout() { auth.logout(); router.replace('/login'); }

let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  await Promise.all([reset(), loadStats()]);
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.processing-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
}

.summary-strip { display: flex; margin: 12px 16px 0; background: white; border-radius: 16px; box-shadow: var(--c-shadow); overflow: hidden; }
.summary-stat { flex: 1; text-align: center; padding: 12px 6px; }
.summary-stat + .summary-stat { border-left: 1px solid var(--c-border); }
.summary-val { font-size: 16px; font-weight: 800; color: var(--c-green-dark); margin: 0; }
.summary-lbl { font-size: 10px; color: var(--c-subtext); margin: 2px 0 0; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }

.filter-card { padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
.c-search-input {
  width: 100%; padding: 11px 14px; border-radius: 10px;
  border: none; background: var(--c-bg); font-size: 14px;
  color: var(--c-text); outline: none; box-sizing: border-box;
}
.status-chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
.status-chip {
  flex-shrink: 0; border: none; background: var(--c-bg); cursor: pointer;
  padding: 7px 12px; border-radius: 100px; font-size: 11px; font-weight: 700;
  color: var(--c-subtext); white-space: nowrap;
}
.status-chip.active { background: var(--c-green); color: white; }
.date-row { display: flex; gap: 8px; }
.date-input { flex: 1; }
.export-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  border: 2px solid var(--c-green); background: transparent; color: var(--c-green-dark);
  border-radius: 10px; padding: 9px 0; font-size: 13px; font-weight: 700; cursor: pointer;
}
.export-btn:disabled { opacity: 0.6; }

.section-title {
  font-size: 13px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--c-subtext); padding: 16px 16px 8px;
}

.orders-list { padding: 4px 0; }
.order-card {
  background: white; border-radius: 16px;
  margin: 6px 14px; padding: 14px;
  box-shadow: var(--c-shadow);
}
.order-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.order-student-name { font-size: 14px; font-weight: 700; margin: 0; color: var(--c-text); }
.order-student-meta { font-size: 11px; color: var(--c-subtext); margin: 2px 0 0; }
.order-total-wrap { text-align: right; flex-shrink: 0; }
.order-total { font-size: 15px; font-weight: 800; color: var(--c-green); margin: 0; }
.order-date { font-size: 11px; color: var(--c-subtext); margin: 2px 0 0; }

.order-lines { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--c-border); }
.order-line {
  display: flex; justify-content: space-between;
  font-size: 12px; color: var(--c-subtext); padding: 3px 0;
}

.order-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--c-border); }
.badge { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 100px; }
.badge.status-completed        { background: var(--c-green-light); color: var(--c-green-dark); }
.badge.status-pending_approval { background: #FFF6E0; color: #7a5c00; }
.badge.status-refund_pending   { background: var(--c-orange-light); color: var(--c-orange); }
.badge.status-refunded         { background: #E8E8F0; color: #6B6B8A; }
.badge.status-rejected         { background: var(--c-orange-light); color: var(--c-orange); }

.refund-link { border: none; background: transparent; color: var(--c-orange); font-size: 12px; font-weight: 700; cursor: pointer; }
.refund-note { font-size: 11px; color: var(--c-subtext); font-weight: 600; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 48px 16px; gap: 10px; color: var(--c-subtext); font-size: 14px; }
.empty-state ion-icon { font-size: 52px; opacity: 0.4; }
.center { display: flex; justify-content: center; padding: 32px; }
</style>
