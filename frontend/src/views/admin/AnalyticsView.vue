<template>
  <template>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>School Analytics</ion-title>
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

      <!-- Month picker -->
      <div class="month-row fade-up">
        <button class="month-nav" @click="shiftMonth(-1)">
          <ion-icon :icon="chevronBackOutline" />
        </button>
        <span class="month-label">{{ monthLabel }}</span>
        <button class="month-nav" :disabled="isCurrentMonth" @click="shiftMonth(1)">
          <ion-icon :icon="chevronForwardOutline" />
        </button>
      </div>

      <div v-if="loading" class="center"><ion-spinner name="crescent" color="primary" /></div>

      <template v-else-if="data">
        <div class="stats-grid fade-up">
          <div class="stat-card" style="--sc:#6C63FF;--scl:#EDE9FF">
            <p class="sc-val">₹{{ data.totals.revenue.toFixed(0) }}</p>
            <p class="sc-lbl">Total Revenue</p>
          </div>
          <div class="stat-card" style="--sc:#00C9A7;--scl:#D6FBF5">
            <p class="sc-val">{{ data.totals.transactionCount }}</p>
            <p class="sc-lbl">Transactions</p>
          </div>
        </div>

        <p class="section-title">Spend by Class</p>
        <div class="sp-card fade-up">
          <div v-if="data.byClass.length === 0" class="no-items">No purchases this month</div>
          <div v-for="c in data.byClass" :key="c.class" class="bar-row">
            <span class="bar-name">{{ c.class }}</span>
            <div class="bar-track"><div class="bar-fill" :style="{ width: pct(c.total, maxClass) + '%', background: '#6C63FF' }" /></div>
            <span class="bar-value">₹{{ c.total.toFixed(0) }}</span>
          </div>
        </div>

        <p class="section-title">Spend by Category</p>
        <div class="sp-card fade-up">
          <div v-if="data.byCategory.length === 0" class="no-items">No purchases this month</div>
          <div v-for="c in data.byCategory" :key="c.category" class="bar-row">
            <span class="cat-dot" :style="{ background: colorFor(c.category) }" />
            <span class="bar-name">{{ labelFor(c.category) }}</span>
            <div class="bar-track"><div class="bar-fill" :style="{ width: pct(c.total, maxCategory) + '%', background: colorFor(c.category) }" /></div>
            <span class="bar-value">₹{{ c.total.toFixed(0) }}</span>
          </div>
        </div>

        <p class="section-title">Spend by Day</p>
        <div class="sp-card fade-up">
          <div v-if="data.byDay.length === 0" class="no-items">No purchases this month</div>
          <div v-for="d in data.byDay" :key="d.day" class="bar-row">
            <span class="bar-name day-name">{{ formatDay(d.day) }}</span>
            <div class="bar-track"><div class="bar-fill" :style="{ width: pct(d.total, maxDay) + '%', background: '#00C9A7' }" /></div>
            <span class="bar-value">₹{{ d.total.toFixed(0) }}</span>
          </div>
        </div>

        <p class="section-title">Top Spenders</p>
        <div class="sp-card fade-up">
          <div v-if="data.topSpenders.length === 0" class="no-items">No purchases this month</div>
          <div v-for="(s, i) in data.topSpenders" :key="s.studentId" class="top-item-row">
            <span class="rank">{{ i + 1 }}</span>
            <div class="top-item-info">
              <p class="top-item-name">{{ s.name }}</p>
            </div>
            <p class="top-item-spend">₹{{ s.total.toFixed(0) }}</p>
          </div>
        </div>
      </template>

      <div style="height: 24px" />
    </ion-content>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent,
} from '@ionic/vue';
import { chevronBackOutline, chevronForwardOutline, logOutOutline } from 'ionicons/icons';
import api from '@/composables/useApi';
import { useAuthStore } from '@/store/auth';
import { colorFor, labelFor } from '@/composables/useCategoryMeta';

interface Overview {
  month: string;
  totals: { revenue: number; transactionCount: number };
  byClass: { class: string; count: number; total: number }[];
  byCategory: { category: string; count: number; total: number }[];
  byDay: { day: string; total: number }[];
  topSpenders: { studentId: string; name: string; total: number }[];
}

const router = useRouter();
const auth   = useAuthStore();

const loading     = ref(true);
const data        = ref<Overview | null>(null);
const monthOffset = ref(0);

const monthDate = computed(() => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + monthOffset.value, 1);
  return d;
});
const monthParam = computed(
  () => `${monthDate.value.getUTCFullYear()}-${String(monthDate.value.getUTCMonth() + 1).padStart(2, '0')}`
);
const monthLabel = computed(
  () => monthDate.value.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
);
const isCurrentMonth = computed(() => monthOffset.value === 0);

function shiftMonth(delta: number) {
  if (delta > 0 && isCurrentMonth.value) return;
  monthOffset.value += delta;
}

const maxClass    = computed(() => Math.max(1, ...(data.value?.byClass.map((c) => c.total) ?? [1])));
const maxCategory = computed(() => Math.max(1, ...(data.value?.byCategory.map((c) => c.total) ?? [1])));
const maxDay      = computed(() => Math.max(1, ...(data.value?.byDay.map((d) => d.total) ?? [1])));

function pct(value: number, max: number) {
  return max > 0 ? (value / max) * 100 : 0;
}

function formatDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

async function load() {
  loading.value = true;
  try {
    const { data: res } = await api.get('/admin/analytics/overview', { params: { month: monthParam.value } });
    data.value = res;
  } catch (err: any) {
    console.error('Failed to load analytics:', err?.response?.data?.error || err.message);
  } finally {
    loading.value = false;
  }
}

async function refresh(event: any) { await load(); event.target.complete(); }

function logout() { auth.logout(); router.replace('/login'); }

watch(monthParam, load);
onMounted(load);
</script>

<style scoped>
.month-row { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 14px 16px 4px; }
.month-nav {
  width: 32px; height: 32px; border-radius: 10px; border: none;
  background: white; box-shadow: var(--sp-shadow); color: var(--sp-purple);
  display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px;
}
.month-nav:disabled { opacity: 0.35; cursor: not-allowed; }
.month-label { font-size: 15px; font-weight: 700; color: var(--sp-text); min-width: 140px; text-align: center; }

.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 16px; }
.stat-card { background: var(--scl); border-radius: 18px; padding: 16px; display: flex; flex-direction: column; gap: 4px; }
.sc-val { font-size: 20px; font-weight: 800; color: var(--sc); margin: 0; overflow-wrap: anywhere; }
.sc-lbl { font-size: 12px; color: var(--sp-subtext); margin: 0; font-weight: 600; }

.section-title {
  font-size: 13px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--sp-subtext); padding: 16px 16px 8px;
}

.bar-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; }
.bar-row + .bar-row { border-top: 1px solid var(--sp-border); }
.cat-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.bar-name { font-size: 13px; font-weight: 600; color: var(--sp-text); width: 78px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.day-name { width: 60px; }
.bar-track { flex: 1; height: 10px; border-radius: 5px; background: var(--sp-bg); overflow: hidden; }
.bar-fill { height: 100%; border-radius: 5px; min-width: 4px; }
.bar-value { font-size: 12px; font-weight: 700; color: var(--sp-subtext); white-space: nowrap; flex-shrink: 0; }
.no-items { font-size: 13px; color: var(--sp-subtext); padding: 8px 0; }

.top-item-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; }
.top-item-row + .top-item-row { border-top: 1px solid var(--sp-border); }
.rank { font-size: 13px; font-weight: 800; color: var(--sp-subtext); width: 16px; flex-shrink: 0; }
.top-item-info { flex: 1; min-width: 0; }
.top-item-name { font-size: 14px; font-weight: 700; margin: 0; color: var(--sp-text); }
.top-item-spend { font-size: 14px; font-weight: 700; color: var(--sp-text); margin: 0; }

.center { display: flex; justify-content: center; padding: 32px; }
ion-content { --background: var(--sp-bg); }
</style>
