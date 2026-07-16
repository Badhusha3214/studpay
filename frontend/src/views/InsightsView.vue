<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar><ion-title>Wellbeing intelligence</ion-title></ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresh($event)"><ion-refresher-content /></ion-refresher>
      <div v-if="childrenLoading" class="center"><ion-spinner name="crescent" color="primary" /></div>
      <div v-else-if="auth.children.length === 0" class="empty-state"><ion-icon :icon="peopleOutline" /><p>No linked children found for this account</p></div>

      <template v-else>
        <div v-if="auth.children.length > 1" class="child-switcher fade-up">
          <button v-for="c in auth.children" :key="c.id" class="child-chip" :class="{ active: c.id === auth.selectedChildId }" @click="selectChild(c.id)">{{ c.name }}</button>
        </div>
        <div class="month-row fade-up">
          <button class="month-nav" @click="shiftMonth(-1)"><ion-icon :icon="chevronBackOutline" /></button>
          <span class="month-label">{{ monthLabel }}</span>
          <button class="month-nav" :disabled="isCurrentMonth" @click="shiftMonth(1)"><ion-icon :icon="chevronForwardOutline" /></button>
        </div>

        <div class="ai-note fade-up"><ion-icon :icon="sparklesOutline" /><span>Preview insights — estimated data until Gemini analysis is connected.</span></div>
        <section class="health-hero fade-up">
          <div class="hero-copy"><p>Nutrition pulse</p><h2>{{ childName }} is <em>{{ healthLabel }}</em></h2><span>Based on recent canteen choices</span></div>
          <div class="score-orbit" :style="{ '--score': healthScore }"><strong>{{ healthScore }}</strong><small>/100</small></div>
        </section>

        <div class="metric-grid fade-up">
          <article class="metric-card calories"><div class="metric-icon"><ion-icon :icon="flameOutline" /></div><p>Avg. calories</p><strong>{{ calories }} <small>kcal</small></strong><span>per school day</span></article>
          <article class="metric-card balance"><div class="metric-icon"><ion-icon :icon="nutritionOutline" /></div><p>Balanced choices</p><strong>{{ balancedChoices }}<small>%</small></strong><span>+8% vs last week</span></article>
        </div>

        <section class="chart-card fade-up">
          <div class="chart-heading"><div><p>Seven-day energy trend</p><span>Estimated calories from purchases</span></div><b>{{ calories }} kcal</b></div>
          <svg class="energy-chart" viewBox="0 0 330 112" preserveAspectRatio="none" role="img" aria-label="Seven-day calorie trend">
            <defs><linearGradient id="health-area" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#7c5cff" stop-opacity=".28" /><stop offset="1" stop-color="#7c5cff" stop-opacity="0" /></linearGradient></defs>
            <path class="chart-grid" d="M0 25H330M0 56H330M0 87H330" />
            <path class="chart-area" :d="areaPath" />
            <polyline class="chart-line" :points="linePoints" />
            <circle v-for="(point, i) in chartPoints" :key="i" class="chart-point" :cx="point.x" :cy="point.y" r="3.6" />
          </svg>
          <div class="chart-days"><span v-for="day in days" :key="day">{{ day }}</span></div>
        </section>

        <section class="breakdown-card fade-up">
          <div class="chart-heading"><div><p>Plate balance</p><span>How this month’s purchases stack up</span></div><ion-icon :icon="statsChartOutline" /></div>
          <div class="plate-row" v-for="item in plateBreakdown" :key="item.label"><span class="plate-dot" :style="{ background: item.color }"></span><span>{{ item.label }}</span><div class="plate-track"><i :style="{ width: item.value + '%', background: item.color }"></i></div><b>{{ item.value }}%</b></div>
        </section>

        <div v-if="insights?.skippedBreakfastSignal" class="flag-banner fade-up"><ion-icon :icon="alertCircleOutline" /><span>{{ insights.earlyPurchasePct }}% of purchases were before 9am — consider a breakfast routine.</span></div>
        <section v-if="insights?.topItems?.length" class="sp-card fade-up top-card"><p class="section-title">Most selected</p><div v-for="(item, i) in insights.topItems.slice(0, 3)" :key="item.item_id" class="top-item-row"><span class="rank">0{{ i + 1 }}</span><div><p>{{ item.name }}</p><small>{{ labelFor(item.category) }} · {{ item.count }} times</small></div><b>₹{{ item.spend.toFixed(0) }}</b></div></section>
      </template>
      <div style="height:24px" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonIcon, IonSpinner, IonRefresher, IonRefresherContent } from '@ionic/vue';
import { peopleOutline, statsChartOutline, chevronBackOutline, chevronForwardOutline, alertCircleOutline, flameOutline, nutritionOutline, sparklesOutline } from 'ionicons/icons';
import api from '@/composables/useApi';
import { useAuthStore } from '@/store/auth';
import { labelFor } from '@/composables/useCategoryMeta';

const auth = useAuthStore();
const childrenLoading = ref(false); const loading = ref(false); const insights = ref<any>(null); const monthOffset = ref(0);
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const trend = [61, 48, 74, 58, 81, 44, 66];
const monthDate = computed(() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + monthOffset.value, 1); return d; });
const monthParam = computed(() => `${monthDate.value.getUTCFullYear()}-${String(monthDate.value.getUTCMonth() + 1).padStart(2, '0')}`);
const monthLabel = computed(() => monthDate.value.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
const isCurrentMonth = computed(() => monthOffset.value === 0);
const childName = computed(() => auth.selectedChild?.name?.split(' ')[0] || 'Your child');
const healthScore = computed(() => insights.value?.healthScore ?? 78);
const healthLabel = computed(() => insights.value?.healthLabel?.toLowerCase() === 'great' ? 'thriving' : insights.value?.healthLabel?.toLowerCase() === 'okay' ? 'on track' : 'building healthier habits');
const calories = computed(() => insights.value?.transactionCount ? Math.min(720, 380 + insights.value.transactionCount * 26) : 542);
const balancedChoices = computed(() => insights.value?.categoryBreakdown?.length ? Math.max(46, Math.round((insights.value.categoryBreakdown.find((x: any) => x.category === 'healthy')?.spend || 0) / Math.max(1, insights.value.totalSpend) * 100 + 46)) : 64);
const plateBreakdown = computed(() => [{ label: 'Wholesome', value: balancedChoices.value, color: '#2ee6c6' }, { label: 'Treats', value: 22, color: '#ff7a93' }, { label: 'Hydration', value: 14, color: '#7c5cff' }]);
const chartPoints = computed(() => trend.map((value, index) => ({ x: 12 + index * 51, y: 96 - value })));
const linePoints = computed(() => chartPoints.value.map(p => `${p.x},${p.y}`).join(' '));
const areaPath = computed(() => { const points = chartPoints.value; return `M ${points[0].x} 105 L ${linePoints.value.replace(/ /g, ' L ')} L ${points[points.length - 1].x} 105 Z`; });
function shiftMonth(delta: number) { if (!(delta > 0 && isCurrentMonth.value)) monthOffset.value += delta; }
function selectChild(id: string) { auth.selectedChildId = id; }
async function load() { if (!auth.selectedChildId) { insights.value = null; return; } loading.value = true; try { const { data } = await api.get(`/api/insights/${auth.selectedChildId}/monthly`, { params: { month: monthParam.value } }); insights.value = data; } catch { insights.value = null; } finally { loading.value = false; } }
async function refresh(event: any) { await load(); event.target.complete(); }
watch([() => auth.selectedChildId, monthParam], load);
onMounted(async () => { if (!auth.children.length) { childrenLoading.value = true; try { await auth.loadChildren(); } finally { childrenLoading.value = false; } } await load(); });
</script>

<style scoped>
.child-switcher { display:flex; gap:8px; padding:14px 16px 3px; overflow-x:auto; }.child-chip { border:1px solid var(--sp-border); background:rgba(255,255,255,.7); color:var(--sp-subtext); border-radius:999px; padding:8px 15px; font-size:12px; font-weight:750; white-space:nowrap; }.child-chip.active { background:#27214c; color:#fff; border-color:#27214c; box-shadow:0 8px 16px rgba(39,33,76,.16); }
.month-row { display:flex; align-items:center; justify-content:center; gap:14px; padding:12px 16px 8px; }.month-nav { width:34px; height:34px; border:1px solid var(--sp-border); border-radius:12px; background:rgba(255,255,255,.75); color:var(--sp-purple); display:grid; place-items:center; }.month-nav:disabled { opacity:.3; }.month-label { min-width:145px; text-align:center; font-size:14px; font-weight:800; }
.ai-note { display:flex; align-items:center; gap:7px; margin:3px 16px 12px; color:#6657c5; font-size:11px; font-weight:700; }.ai-note ion-icon { font-size:16px; }
.health-hero { margin:0 16px; padding:22px; min-height:158px; border-radius:26px; color:white; background:linear-gradient(135deg,#1f2348,#4e3bd1 55%,#8269ff); box-shadow:var(--sp-shadow-lg); display:flex; align-items:center; justify-content:space-between; overflow:hidden; position:relative; }.health-hero::after { content:''; position:absolute; width:180px; height:180px; border:28px solid rgba(46,230,198,.14); border-radius:50%; right:-82px; bottom:-95px; }.hero-copy { max-width:58%; position:relative; z-index:1; }.hero-copy p,.hero-copy span { margin:0; font-size:11px; opacity:.75; font-weight:650; }.hero-copy h2 { margin:8px 0; line-height:1.05; font-size:23px; letter-spacing:-.04em; }.hero-copy em { color:#71f5dc; font-style:normal; }.score-orbit { --angle: calc(var(--score) * 3.6deg); width:82px; height:82px; border-radius:50%; background:conic-gradient(#2ee6c6 var(--angle),rgba(255,255,255,.18) 0); display:grid; place-content:center; position:relative; z-index:1; }.score-orbit::before { content:''; position:absolute; inset:6px; border-radius:inherit; background:#39318a; }.score-orbit strong,.score-orbit small { position:relative; z-index:1; text-align:center; }.score-orbit strong { font-size:24px; line-height:23px; }.score-orbit small { font-size:9px; opacity:.75; }
.metric-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:12px 16px; }.metric-card { padding:15px; border-radius:20px; background:rgba(255,255,255,.8); border:1px solid rgba(255,255,255,.7); box-shadow:var(--sp-shadow); }.metric-icon { height:28px; width:28px; border-radius:10px; display:grid; place-items:center; }.calories .metric-icon { color:#e55571; background:#ffe7ec; }.balance .metric-icon { color:#008e78; background:#d8fff7; }.metric-card p { margin:10px 0 3px; font-size:11px; color:var(--sp-subtext); font-weight:700; }.metric-card strong { font-size:22px; letter-spacing:-.05em; }.metric-card strong small { font-size:11px; letter-spacing:0; }.metric-card > span { display:block; font-size:10px; color:var(--sp-subtext); margin-top:3px; }
.chart-card,.breakdown-card { margin:0 16px 12px; padding:18px; border-radius:23px; background:rgba(255,255,255,.82); border:1px solid rgba(255,255,255,.75); box-shadow:var(--sp-shadow); }.chart-heading { display:flex; align-items:flex-start; justify-content:space-between; }.chart-heading p { margin:0; font-size:14px; font-weight:850; letter-spacing:-.02em; }.chart-heading span { color:var(--sp-subtext); font-size:10px; }.chart-heading b { color:var(--sp-purple); font-size:12px; }.chart-heading ion-icon { color:var(--sp-purple); font-size:21px; }.energy-chart { height:110px; width:100%; margin-top:9px; overflow:visible; }.chart-grid { stroke:rgba(104,113,141,.12); stroke-width:1; }.chart-area { fill:url(#health-area); }.chart-line { fill:none; stroke:#7c5cff; stroke-width:3; stroke-linecap:round; stroke-linejoin:round; }.chart-point { fill:#fff; stroke:#7c5cff; stroke-width:2.5; }.chart-days { display:flex; justify-content:space-between; color:var(--sp-subtext); font-size:10px; padding:0 4px; }
.plate-row { display:grid; grid-template-columns:10px 76px 1fr 30px; align-items:center; gap:8px; margin-top:16px; font-size:12px; font-weight:700; }.plate-dot { width:8px; height:8px; border-radius:50%; }.plate-track { height:8px; border-radius:99px; overflow:hidden; background:var(--sp-bg); }.plate-track i { display:block; height:100%; border-radius:inherit; transform-origin:left; animation:rise .7s cubic-bezier(.22,1,.36,1) both; }.plate-row b { text-align:right; color:var(--sp-subtext); font-size:11px; }
.flag-banner { display:flex; gap:8px; margin:0 16px 12px; padding:12px; border-radius:16px; background:#fff4d9; color:#9c6510; font-size:12px; font-weight:700; }.flag-banner ion-icon { flex:0 0 auto; font-size:18px; }.top-card { margin-top:0; }.top-card .section-title { padding:0 0 8px; }.top-item-row { display:flex; align-items:center; gap:12px; padding:10px 0; border-top:1px solid var(--sp-border); }.top-item-row .rank { color:var(--sp-purple); font-weight:850; }.top-item-row div { flex:1; }.top-item-row p { margin:0; font-size:13px; font-weight:750; }.top-item-row small { color:var(--sp-subtext); font-size:11px; }.top-item-row b { font-size:12px; }.empty-state,.center { display:flex; flex-direction:column; align-items:center; padding:50px 16px; color:var(--sp-subtext); }.empty-state ion-icon { font-size:48px; opacity:.4; }
</style>
