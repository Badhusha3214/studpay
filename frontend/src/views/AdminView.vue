<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Admin Panel</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- Stats cards -->
      <div class="stats-grid fade-up">
        <div class="stat-card purple">
          <p class="stat-val">{{ stats.totalStudents }}</p>
          <p class="stat-label">Students</p>
        </div>
        <div class="stat-card teal">
          <p class="stat-val">{{ stats.totalCards }}</p>
          <p class="stat-label">Active Cards</p>
        </div>
        <div class="stat-card orange">
          <p class="stat-val">₹{{ stats.totalRevenue?.toFixed(0) ?? 0 }}</p>
          <p class="stat-label">Revenue</p>
        </div>
        <div class="stat-card yellow">
          <p class="stat-val">{{ stats.todayTransactions }}</p>
          <p class="stat-label">Today's Txns</p>
        </div>
      </div>

      <!-- Top-up section -->
      <p class="sp-section-title">Wallet Top-Up</p>
      <div class="sp-card fade-up">
        <div class="field-group">
          <label>Student ID</label>
          <ion-input v-model="topupStudentId" placeholder="e.g. stu-001" class="sp-input-sm" />
        </div>
        <div class="field-group">
          <label>Amount (₹)</label>
          <ion-input v-model="topupAmount" type="number" placeholder="0" class="sp-input-sm" />
        </div>
        <ion-button expand="block" class="topup-btn" :disabled="topupLoading" @click="doTopup">
          <ion-spinner v-if="topupLoading" name="crescent" />
          <span v-else>Top Up Wallet</span>
        </ion-button>
        <p v-if="topupMsg" class="topup-msg" :class="topupMsgClass">{{ topupMsg }}</p>
      </div>

      <!-- NFC lookup -->
      <p class="sp-section-title">NFC Card Lookup</p>
      <div class="sp-card fade-up">
        <div class="field-group">
          <label>NFC UID</label>
          <div class="uid-row">
            <ion-input v-model="lookupUid" placeholder="e.g. A1B2C3D4" class="sp-input-sm" />
            <ion-button class="lookup-btn" @click="doLookup">Search</ion-button>
          </div>
        </div>
        <div v-if="lookupResult" class="lookup-result">
          <div class="lr-row"><span>Name</span><strong>{{ lookupResult.student.name }}</strong></div>
          <div class="lr-row"><span>Class</span><strong>{{ lookupResult.student.class }}</strong></div>
          <div class="lr-row"><span>Balance</span><strong class="balance-hi">₹{{ lookupResult.student.balance?.toFixed(2) }}</strong></div>
        </div>
        <p v-if="lookupError" class="topup-msg error">{{ lookupError }}</p>
      </div>

      <!-- Recent transactions log -->
      <p class="sp-section-title">Transaction Log</p>

      <div v-if="txnLoading" class="center">
        <ion-spinner name="crescent" color="primary" />
      </div>

      <div v-else>
        <div
          v-for="txn in adminTxns"
          :key="txn.id"
          class="log-row fade-up"
        >
          <div class="log-left">
            <div class="log-icon" :class="txn.type">
              <ion-icon :icon="txn.type === 'credit' ? arrowDownOutline : arrowUpOutline" />
            </div>
            <div>
              <p class="log-name">{{ txn.student_name }} <span class="log-class">({{ txn.class }})</span></p>
              <p class="log-desc">{{ txn.description }} · {{ txn.merchant }}</p>
              <p class="log-date">{{ formatDate(txn.created_at) }}</p>
            </div>
          </div>
          <div class="log-amount" :class="txn.type">
            {{ txn.type === 'credit' ? '+' : '-' }}₹{{ txn.amount.toFixed(2) }}
          </div>
        </div>
      </div>

      <div style="height: 24px" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonInput, IonButton, IonSpinner, IonIcon,
} from '@ionic/vue';
import { arrowUpOutline, arrowDownOutline } from 'ionicons/icons';
import api from '@/composables/useApi';

const stats = ref({ totalStudents: 0, totalCards: 0, totalRevenue: 0, todayTransactions: 0 });
const adminTxns   = ref<any[]>([]);
const txnLoading  = ref(false);

const topupStudentId = ref('stu-001');
const topupAmount    = ref('');
const topupLoading   = ref(false);
const topupMsg       = ref('');
const topupMsgClass  = ref('');

const lookupUid    = ref('A1B2C3D4');
const lookupResult = ref<any>(null);
const lookupError  = ref('');

async function loadAll() {
  txnLoading.value = true;
  try {
    const [sRes, tRes] = await Promise.all([
      api.get('/admin/stats'),
      api.get('/admin/transactions'),
    ]);
    stats.value    = sRes.data;
    adminTxns.value = tRes.data;
  } finally {
    txnLoading.value = false;
  }
}

async function doTopup() {
  topupLoading.value = true;
  topupMsg.value     = '';
  try {
    const { data } = await api.post('/wallet/topup', {
      studentId: topupStudentId.value,
      amount: Number(topupAmount.value),
    });
    topupMsg.value      = `Success! New balance: ₹${data.newBalance.toFixed(2)}`;
    topupMsgClass.value = 'success';
    topupAmount.value   = '';
    loadAll();
  } catch (e: any) {
    topupMsg.value      = e?.response?.data?.error || 'Top-up failed';
    topupMsgClass.value = 'error';
  } finally {
    topupLoading.value = false;
  }
}

async function doLookup() {
  lookupResult.value = null;
  lookupError.value  = '';
  try {
    const { data } = await api.post('/nfc/lookup', { uid: lookupUid.value });
    lookupResult.value = data;
  } catch (e: any) {
    lookupError.value = e?.response?.data?.error || 'Card not found';
  }
}

function formatDate(dt: string) {
  return new Date(dt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

onMounted(loadAll);
</script>

<style scoped>
.stats-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 12px; padding: 16px;
}
.stat-card {
  border-radius: 16px; padding: 16px;
  display: flex; flex-direction: column;
}
.stat-card.purple { background: var(--sp-purple);      color: white; }
.stat-card.teal   { background: var(--sp-teal);        color: white; }
.stat-card.orange { background: var(--sp-orange);       color: white; }
.stat-card.yellow { background: #F6A623; color: white; }
.stat-val   { font-size: 28px; font-weight: 800; margin: 0; }
.stat-label { font-size: 12px; opacity: 0.85; margin: 4px 0 0; }

.field-group { margin-bottom: 14px; }
.field-group label {
  display: block; font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--sp-subtext); margin-bottom: 6px;
}
.sp-input-sm {
  --background: var(--sp-bg);
  --padding-start: 12px;
  border-radius: 10px;
  font-size: 14px;
}
.uid-row { display: flex; gap: 8px; align-items: center; }
.lookup-btn {
  --background: var(--sp-purple);
  --border-radius: 10px;
  height: 44px; flex-shrink: 0;
}

.topup-btn {
  --background: var(--sp-teal);
  --border-radius: 12px;
  height: 48px; font-weight: 700;
}
.topup-msg { font-size: 13px; font-weight: 600; text-align: center; margin-top: 8px; }
.topup-msg.success { color: var(--sp-teal); }
.topup-msg.error   { color: var(--sp-orange); }

.lookup-result { background: var(--sp-bg); border-radius: 10px; padding: 12px; margin-top: 10px; }
.lr-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
.lr-row span  { color: var(--sp-subtext); }
.balance-hi   { color: var(--sp-purple); font-size: 15px; }

.log-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sp-border);
  background: white;
}
.log-left { display: flex; align-items: center; gap: 10px; }
.log-icon {
  width: 36px; height: 36px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center; font-size: 16px;
}
.log-icon.credit { background: var(--sp-teal-light);  color: var(--sp-teal); }
.log-icon.debit  { background: var(--sp-orange-light); color: var(--sp-orange); }
.log-name  { font-size: 13px; font-weight: 600; margin: 0; }
.log-class { font-weight: 400; color: var(--sp-subtext); }
.log-desc  { font-size: 11px; color: var(--sp-subtext); margin: 2px 0 0; }
.log-date  { font-size: 11px; color: var(--sp-subtext); margin: 2px 0 0; }
.log-amount { font-size: 14px; font-weight: 700; }
.log-amount.credit { color: var(--sp-teal); }
.log-amount.debit  { color: var(--sp-orange); }

.center { display: flex; justify-content: center; padding: 32px; }
</style>
