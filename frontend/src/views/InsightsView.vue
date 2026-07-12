<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Purchase Insights</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div v-if="childrenLoading" class="center"><ion-spinner name="crescent" color="primary" /></div>

      <div v-else-if="auth.children.length === 0" class="empty-state">
        <ion-icon :icon="peopleOutline" />
        <p>No linked children found for this account</p>
      </div>

      <template v-else>
        <!-- Child switcher -->
        <div v-if="auth.children.length > 1" class="child-switcher fade-up">
          <div
            v-for="c in auth.children" :key="c.id"
            class="child-chip" :class="{ active: c.id === auth.selectedChildId }"
            @click="selectChild(c.id)"
          >{{ c.name }}</div>
        </div>

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

        <div v-else-if="!insights || insights.transactionCount === 0" class="empty-state">
          <ion-icon :icon="statsChartOutline" />
          <p>No canteen purchases recorded this month</p>
        </div>

        <template v-else>
          <!-- Health score -->
          <div class="sp-card fade-up score-card">
            <div class="score-ring" :class="scoreClass">
              <span class="score-num">{{ insights.healthScore }}</span>
            </div>
            <div class="score-info">
              <p class="score-label" :class="scoreClass">{{ insights.healthLabel }}</p>
              <p class="score-sub">Health Score &middot; rule-based, not AI</p>
            </div>
          </div>

          <!-- Early-purchase / skipped-breakfast signal -->
          <div v-if="insights.skippedBreakfastSignal" class="flag-banner fade-up">
            <ion-icon :icon="alertCircleOutline" />
            <span>{{ insights.earlyPurchasePct }}% of purchases were before 9am &mdash; possible skipped breakfast</span>
          </div>

          <!-- Category breakdown -->
          <p class="section-title">Category Breakdown</p>
          <div class="sp-card fade-up">
            <div v-for="c in insights.categoryBreakdown" :key="c.category" class="cat-row">
              <span class="cat-dot" :style="{ background: colorFor(c.category) }" />
              <span class="cat-name">{{ labelFor(c.category) }}</span>
              <div class="cat-bar-track">
                <div class="cat-bar-fill" :style="{ width: pct(c.spend) + '%', background: colorFor(c.category) }" />
              </div>
              <span class="cat-value">₹{{ c.spend.toFixed(0) }} &middot; {{ pct(c.spend).toFixed(0) }}%</span>
            </div>
          </div>

          <!-- Top items -->
          <p class="section-title">Top Items</p>
          <div class="sp-card fade-up">
            <div v-if="insights.topItems.length === 0" class="no-items">No individual menu items purchased yet</div>
            <div v-for="(item, i) in insights.topItems" :key="item.item_id" class="top-item-row">
              <span class="rank">{{ i + 1 }}</span>
              <span class="cat-dot" :style="{ background: colorFor(item.category) }" />
              <div class="top-item-info">
                <p class="top-item-name">{{ item.name }}</p>
                <p class="top-item-meta">{{ labelFor(item.category) }}</p>
              </div>
              <div class="top-item-stats">
                <p class="top-item-count">{{ item.count }}&times;</p>
                <p class="top-item-spend">₹{{ item.spend.toFixed(0) }}</p>
              </div>
            </div>
          </div>

          <!-- Summary stats -->
          <div class="stats-grid fade-up">
            <div class="stat-card" style="--sc:#6C63FF;--scl:#EDE9FF">
              <p class="sc-val">₹{{ insights.totalSpend.toFixed(0) }}</p>
              <p class="sc-lbl">Total Spend</p>
            </div>
            <div class="stat-card" style="--sc:#00C9A7;--scl:#D6FBF5">
              <p class="sc-val">{{ insights.transactionCount }}</p>
              <p class="sc-lbl">Purchases</p>
            </div>
          </div>
        </template>
      </template>

      <div style="height: 24px" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent,
} from '@ionic/vue';
import {
  peopleOutline, statsChartOutline, chevronBackOutline, chevronForwardOutline, alertCircleOutline,
} from 'ionicons/icons';
import api from '@/composables/useApi';
import { useAuthStore } from '@/store/auth';
import { colorFor, labelFor } from '@/composables/useCategoryMeta';

const auth = useAuthStore();

const childrenLoading = ref(false);
const loading          = ref(false);
const insights         = ref<any>(null);
const monthOffset      = ref(0); // 0 = current month, negative = past months

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

function pct(spend: number) {
  if (!insights.value?.totalSpend) return 0;
  return (spend / insights.value.totalSpend) * 100;
}

const scoreClass = computed(() => {
  const label = insights.value?.healthLabel;
  if (label === 'Great') return 'great';
  if (label === 'Okay') return 'okay';
  return 'attention';
});

async function load() {
  if (!auth.selectedChildId) { insights.value = null; return; }
  loading.value = true;
  try {
    const { data } = await api.get(`/api/insights/${auth.selectedChildId}/monthly`, {
      params: { month: monthParam.value },
    });
    insights.value = data;
  } catch {
    insights.value = null;
  } finally {
    loading.value = false;
  }
}

function selectChild(id: string) {
  auth.selectedChildId = id;
}

async function refresh(event: any) { await load(); event.target.complete(); }

watch([() => auth.selectedChildId, monthParam], load);

onMounted(async () => {
  if (auth.children.length === 0) {
    childrenLoading.value = true;
    try { await auth.loadChildren(); } finally { childrenLoading.value = false; }
  }
  await load();
});
</script>

<style scoped>
.child-switcher { display: flex; gap: 8px; padding: 16px 16px 4px; overflow-x: auto; }
.child-chip {
  padding: 8px 18px; border-radius: 100px; white-space: nowrap;
  background: white; color: var(--sp-subtext); font-size: 13px; font-weight: 600;
  cursor: pointer; border: 2px solid transparent; box-shadow: var(--sp-shadow);
}
.child-chip.active { background: var(--sp-purple-light); color: var(--sp-purple); border-color: var(--sp-purple); }

.month-row {
  display: flex; align-items: center; justify-content: center; gap: 16px;
  padding: 14px 16px 4px;
}
.month-nav {
  width: 32px; height: 32px; border-radius: 10px; border: none;
  background: white; box-shadow: var(--sp-shadow); color: var(--sp-purple);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  font-size: 16px;
}
.month-nav:disabled { opacity: 0.35; cursor: not-allowed; }
.month-label { font-size: 15px; font-weight: 700; color: var(--sp-text); min-width: 140px; text-align: center; }

.score-card { margin: 4px 16px 0; padding: 16px; display: flex; align-items: center; gap: 16px; }
.score-ring {
  width: 64px; height: 64px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; border: 4px solid;
}
.score-ring.great     { border-color: var(--sp-teal);   background: var(--sp-teal-light); }
.score-ring.okay      { border-color: #F6A623;          background: #FFF3D6; }
.score-ring.attention { border-color: var(--sp-orange); background: var(--sp-orange-light); }
.score-num { font-size: 20px; color: var(--sp-text); }
.score-info { flex: 1; }
.score-label { font-size: 17px; font-weight: 800; margin: 0; }
.score-label.great     { color: var(--sp-teal); }
.score-label.okay      { color: #C98500; }
.score-label.attention { color: var(--sp-orange); }
.score-sub { font-size: 12px; color: var(--sp-subtext); margin: 2px 0 0; }

.flag-banner {
  display: flex; align-items: center; gap: 8px;
  background: #FFF3D6; color: #B45309;
  border-radius: 12px; padding: 10px 14px; margin: 12px 16px 0;
  font-size: 13px; font-weight: 700;
}
.flag-banner ion-icon { font-size: 18px; flex-shrink: 0; }

.section-title {
  font-size: 13px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--sp-subtext); padding: 16px 16px 8px;
}

.cat-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; }
.cat-row + .cat-row { border-top: 1px solid var(--sp-border); }
.cat-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.cat-name { font-size: 13px; font-weight: 600; color: var(--sp-text); width: 78px; flex-shrink: 0; }
.cat-bar-track { flex: 1; height: 10px; border-radius: 5px; background: var(--sp-bg); overflow: hidden; }
.cat-bar-fill { height: 100%; border-radius: 5px; min-width: 4px; }
.cat-value { font-size: 12px; font-weight: 700; color: var(--sp-subtext); white-space: nowrap; flex-shrink: 0; }

.no-items { font-size: 13px; color: var(--sp-subtext); padding: 8px 0; }
.top-item-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; }
.top-item-row + .top-item-row { border-top: 1px solid var(--sp-border); }
.rank { font-size: 13px; font-weight: 800; color: var(--sp-subtext); width: 16px; flex-shrink: 0; }
.top-item-info { flex: 1; min-width: 0; }
.top-item-name { font-size: 14px; font-weight: 700; margin: 0; color: var(--sp-text); }
.top-item-meta { font-size: 11px; color: var(--sp-subtext); margin: 2px 0 0; }
.top-item-stats { text-align: right; flex-shrink: 0; }
.top-item-count { font-size: 12px; color: var(--sp-subtext); margin: 0; }
.top-item-spend { font-size: 14px; font-weight: 700; color: var(--sp-text); margin: 2px 0 0; }

.stats-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 12px; padding: 16px 16px 4px;
}
.stat-card {
  background: var(--scl); border-radius: 18px; padding: 16px;
  display: flex; flex-direction: column; gap: 4px;
}
.sc-val { font-size: 20px; font-weight: 800; color: var(--sc); margin: 0; overflow-wrap: anywhere; }
.sc-lbl { font-size: 12px; color: var(--sp-subtext); margin: 0; font-weight: 600; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 48px 16px; gap: 10px; color: var(--sp-subtext); font-size: 14px; }
.empty-state ion-icon { font-size: 52px; opacity: 0.4; }
.center { display: flex; justify-content: center; padding: 32px; }
</style>
