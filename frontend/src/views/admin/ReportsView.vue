<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="router.push('/admin/dashboard')">
            <ion-icon :icon="arrowBackOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
        <ion-title>Reports</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <p class="sp-section-title">Spending Report</p>
      <div class="sp-card fade-up filter-card">
        <div class="filter-row">
          <div class="form-group">
            <label>From</label>
            <input v-model="from" type="date" class="form-input" @change="load" />
          </div>
          <div class="form-group">
            <label>To</label>
            <input v-model="to" type="date" class="form-input" @change="load" />
          </div>
        </div>
        <div class="filter-row">
          <div class="form-group">
            <label>Shop</label>
            <select v-model="shopId" class="form-input form-select" @change="load">
              <option value="">All shops</option>
              <option v-for="s in shops" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>Grade</label>
            <input v-model="grade" placeholder="e.g. 10" class="form-input" @change="load" />
          </div>
        </div>
        <ion-button expand="block" class="link-btn" :disabled="exporting" @click="exportCsv">
          <ion-spinner v-if="exporting" name="crescent" />
          <template v-else><ion-icon :icon="downloadOutline" slot="start" /> Export CSV</template>
        </ion-button>
      </div>

      <div v-if="loading" class="center"><ion-spinner name="crescent" color="primary" /></div>

      <template v-else-if="report">
        <div class="stats-grid fade-up">
          <div class="stat-card" style="--sc:#6C63FF;--scl:#EDE9FF">
            <p class="sc-val">₹{{ report.totals.amount.toFixed(0) }}</p>
            <p class="sc-lbl">Total Spend</p>
          </div>
          <div class="stat-card" style="--sc:#00C9A7;--scl:#D6FBF5">
            <p class="sc-val">{{ report.totals.count }}</p>
            <p class="sc-lbl">Transactions</p>
          </div>
        </div>

        <div class="sp-card fade-up table-card">
          <div v-if="report.rows.length === 0" class="no-items">No transactions in this range</div>
          <table v-else class="report-table">
            <thead><tr><th>Date</th><th>Student</th><th>Shop</th><th>Amount</th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in report.rows.slice(0, 50)" :key="i">
                <td>{{ formatDate(r.created_at) }}</td>
                <td>{{ r.student_name }} <span class="row-class">{{ r.class }}</span></td>
                <td>{{ r.merchant }}</td>
                <td class="amount-col">₹{{ Number(r.amount).toFixed(0) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="report.rows.length > 50" class="more-note">Showing first 50 of {{ report.rows.length }} — export CSV for the full list.</p>
        </div>
      </template>

      <p class="sp-section-title">Emergency Fund Usage</p>
      <div class="sp-card fade-up table-card">
        <div v-if="emergencyLoading" class="center small"><ion-spinner name="crescent" color="primary" /></div>
        <div v-else-if="emergencyUsage.length === 0" class="no-items">No emergency fund draws recorded</div>
        <div v-else v-for="e in emergencyUsage" :key="e.studentId" class="ef-row">
          <div class="ef-info">
            <p class="ef-name">{{ e.studentName }} <span class="row-class">{{ e.class }}</span></p>
            <p class="ef-parent">{{ e.parentName || 'No linked parent' }}{{ e.parentPhone ? ` · ${e.parentPhone}` : '' }}</p>
          </div>
          <div class="ef-stats">
            <p class="ef-total">₹{{ e.totalDrawn.toFixed(0) }}</p>
            <p class="ef-count">{{ e.drawCount }} draw{{ e.drawCount === 1 ? '' : 's' }}</p>
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
  IonIcon, IonSpinner,
} from '@ionic/vue';
import { arrowBackOutline, downloadOutline } from 'ionicons/icons';
import api from '@/composables/useApi';

interface Shop { id: string; name: string; }
interface ReportRow { created_at: string; amount: number; merchant: string; student_name: string; class: string; }
interface Report { totals: { count: number; amount: number }; rows: ReportRow[]; }
interface EmergencyUsage {
  studentId: string; studentName: string; class: string; drawCount: number;
  totalDrawn: number; parentName: string | null; parentPhone: string | null;
}

const router = useRouter();

const shops = ref<Shop[]>([]);
const from  = ref('');
const to    = ref('');
const shopId = ref('');
const grade  = ref('');

const loading  = ref(false);
const report   = ref<Report | null>(null);
const exporting = ref(false);

const emergencyLoading = ref(false);
const emergencyUsage   = ref<EmergencyUsage[]>([]);

function toEndOfDay(d: string) {
  return d ? `${d}T23:59:59` : undefined;
}

function reportParams() {
  return {
    from: from.value || undefined,
    to: toEndOfDay(to.value),
    shopId: shopId.value || undefined,
    grade: grade.value || undefined,
  };
}

function formatDate(dt: string) {
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function loadShops() {
  const { data } = await api.get('/admin/shops');
  shops.value = data;
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/reports/spending', { params: reportParams() });
    report.value = data;
  } finally {
    loading.value = false;
  }
}

async function loadEmergencyUsage() {
  emergencyLoading.value = true;
  try {
    const { data } = await api.get('/admin/reports/emergency-fund');
    emergencyUsage.value = data;
  } finally {
    emergencyLoading.value = false;
  }
}

async function exportCsv() {
  exporting.value = true;
  try {
    const { data } = await api.get('/admin/reports/spending', {
      params: { ...reportParams(), format: 'csv' },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `spending-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    exporting.value = false;
  }
}

onMounted(() => {
  loadShops();
  load();
  loadEmergencyUsage();
});
</script>

<style scoped>
.filter-card { padding: 16px; }
.filter-row { display: flex; gap: 10px; }
.filter-row .form-group { flex: 1; }
.form-group { margin-bottom: 12px; }
.form-group label {
  display: block; font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--sp-subtext); margin-bottom: 6px;
}
.form-input {
  width: 100%; padding: 10px 12px; border-radius: 10px;
  border: 2px solid var(--sp-border); background: var(--sp-bg);
  font-size: 13px; color: var(--sp-text); outline: none; box-sizing: border-box;
}
.form-input:focus { border-color: var(--sp-purple); }
.form-select {
  appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3e%3cpath d='M6 9l6 6 6-6'/%3e%3c/svg%3e");
  background-repeat: no-repeat; background-position: right 10px center; background-size: 14px;
  padding-right: 30px; cursor: pointer;
}
.link-btn { --background: var(--sp-purple); --border-radius: 12px; height: 46px; font-weight: 700; margin-top: 4px; }

.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 16px; }
.stat-card { background: var(--scl); border-radius: 18px; padding: 16px; display: flex; flex-direction: column; gap: 4px; }
.sc-val { font-size: 20px; font-weight: 800; color: var(--sc); margin: 0; overflow-wrap: anywhere; }
.sc-lbl { font-size: 12px; color: var(--sp-subtext); margin: 0; font-weight: 600; }

.table-card { padding: 12px; overflow-x: auto; }
.report-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.report-table th { text-align: left; padding: 8px 6px; color: var(--sp-subtext); font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; }
.report-table td { padding: 8px 6px; border-top: 1px solid var(--sp-border); color: var(--sp-text); white-space: nowrap; }
.row-class { color: var(--sp-subtext); font-size: 11px; }
.amount-col { font-weight: 700; text-align: right; }
.more-note { font-size: 11px; color: var(--sp-subtext); margin: 10px 2px 2px; }
.no-items { font-size: 13px; color: var(--sp-subtext); padding: 8px 4px; }

.ef-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 4px; }
.ef-row + .ef-row { border-top: 1px solid var(--sp-border); }
.ef-name { font-size: 13px; font-weight: 700; margin: 0; color: var(--sp-text); }
.ef-parent { font-size: 11px; color: var(--sp-subtext); margin: 2px 0 0; }
.ef-stats { text-align: right; }
.ef-total { font-size: 14px; font-weight: 800; margin: 0; color: var(--sp-orange); }
.ef-count { font-size: 11px; color: var(--sp-subtext); margin: 2px 0 0; }

.center { display: flex; justify-content: center; padding: 32px; }
.center.small { padding: 16px; }
</style>
