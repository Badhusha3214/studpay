<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="router.push('/pay')">
            <ion-icon :icon="arrowBackOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
        <ion-title>{{ auth.student?.merchant_name || 'Dashboard' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- Today's sales -->
      <div class="stats-grid fade-up">
        <div class="stat-card" style="--sc:#1B998B;--scl:#D6F5F2">
          <p class="sc-val">₹{{ stats.todayRevenue?.toFixed(0) ?? 0 }}</p>
          <p class="sc-lbl">Today's Revenue</p>
        </div>
        <div class="stat-card" style="--sc:#FF6B35;--scl:#FFE8DF">
          <p class="sc-val">{{ stats.todayTransactions ?? 0 }}</p>
          <p class="sc-lbl">Today's Sales</p>
        </div>
      </div>

      <!-- Student / card lookup -->
      <p class="section-title">Student / Card Lookup</p>
      <div class="c-card fade-up">
        <div class="field-group">
          <label>NFC UID</label>
          <div class="uid-row">
            <ion-input v-model="lookupUid" placeholder="e.g. A1B2C3D4" class="c-input-inline" />
            <ion-button class="lookup-btn" :disabled="!lookupUid || lookupLoading" @click="doLookup">
              <ion-spinner v-if="lookupLoading" name="crescent" />
              <span v-else>Search</span>
            </ion-button>
          </div>
        </div>
        <div v-if="lookupResult" class="lookup-result">
          <div class="lr-row"><span>Name</span><strong>{{ lookupResult.student.name }}</strong></div>
          <div class="lr-row"><span>Class</span><strong>{{ lookupResult.student.class }}</strong></div>
          <div class="lr-row"><span>Balance</span><strong class="balance-hi">₹{{ lookupResult.student.balance?.toFixed(2) }}</strong></div>
        </div>
        <p v-if="lookupError" class="msg error">{{ lookupError }}</p>
      </div>

      <!-- Register new NFC card -->
      <p class="section-title">Register New NFC Card</p>
      <div class="c-card fade-up">
        <div class="scan-tile" :class="{ scanning: nfcScanning }" @click="scanNewCard">
          <div class="scan-tile-icon">
            <ion-icon :icon="wifiOutline" />
          </div>
          <div>
            <p class="scan-tile-title">{{ nfcScanning ? 'Hold card near phone...' : 'Scan NFC Tag' }}</p>
            <p class="scan-tile-sub">Tap to scan automatically</p>
          </div>
          <ion-spinner v-if="nfcScanning" name="crescent" />
        </div>

        <div class="field-group">
          <label>Card UID</label>
          <ion-input v-model="newUid" placeholder="e.g. A1B2C3D4" class="c-input-inline" />
        </div>

        <div class="field-group">
          <label>Student</label>
          <ion-select v-model="newStudentId" placeholder="Select a student" interface="popover" class="c-input-inline">
            <ion-select-option v-for="s in students" :key="s.id" :value="s.id">
              {{ s.name }} — {{ s.class }}{{ s.card_uid ? ' (has a card)' : '' }}
            </ion-select-option>
          </ion-select>
        </div>

        <ion-button
          expand="block" class="link-btn"
          :disabled="!newUid || !newStudentId || registerLoading"
          @click="registerCard"
        >
          <ion-spinner v-if="registerLoading" name="crescent" />
          <span v-else>Link Tag to Student</span>
        </ion-button>
        <p v-if="registerMsg" class="msg" :class="registerMsgClass">{{ registerMsg }}</p>
      </div>

      <!-- Transaction log -->
      <p class="section-title">Transaction Log</p>
      <div v-if="txnLoading" class="center">
        <ion-spinner name="crescent" color="primary" />
      </div>
      <div v-else-if="txns.length === 0" class="empty-state">
        <ion-icon :icon="receiptOutline" />
        <p>No sales yet today</p>
      </div>
      <div v-else>
        <div v-for="txn in txns" :key="txn.id" class="log-row fade-up">
          <div class="log-left">
            <div class="log-icon">
              <ion-icon :icon="arrowUpOutline" />
            </div>
            <div>
              <p class="log-name">{{ txn.student_name }} <span class="log-class">({{ txn.class }})</span></p>
              <p class="log-desc">{{ txn.description }}</p>
              <p class="log-date">{{ formatDate(txn.created_at) }}</p>
            </div>
          </div>
          <div class="log-amount">-₹{{ txn.amount.toFixed(2) }}</div>
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
  IonInput, IonSelect, IonSelectOption, IonIcon, IonSpinner,
} from '@ionic/vue';
import {
  arrowBackOutline, wifiOutline, receiptOutline, arrowUpOutline,
} from 'ionicons/icons';
import { useAuthStore } from '@/store/auth';
import { useNfc } from '@/composables/useNfc';
import api from '@/composables/useApi';

const router = useRouter();
const auth   = useAuthStore();
const { scanning: nfcScanning, startScan, error: nfcError } = useNfc();

const stats      = ref<{ todayRevenue: number; todayTransactions: number }>({ todayRevenue: 0, todayTransactions: 0 });
const txns       = ref<any[]>([]);
const txnLoading = ref(false);

const lookupUid     = ref('');
const lookupResult  = ref<any>(null);
const lookupError   = ref('');
const lookupLoading = ref(false);

const students          = ref<any[]>([]);
const newUid            = ref('');
const newStudentId      = ref('');
const registerLoading   = ref(false);
const registerMsg       = ref('');
const registerMsgClass  = ref('');

async function loadAll() {
  txnLoading.value = true;
  try {
    const [statsRes, txnRes, stuRes] = await Promise.all([
      api.get('/shop/stats'),
      api.get('/shop/transactions'),
      api.get('/students'),
    ]);
    stats.value    = statsRes.data;
    txns.value     = txnRes.data;
    students.value = stuRes.data;
  } finally {
    txnLoading.value = false;
  }
}

async function doLookup() {
  lookupResult.value  = null;
  lookupError.value   = '';
  lookupLoading.value = true;
  try {
    const { data } = await api.post('/nfc/lookup', { uid: lookupUid.value });
    lookupResult.value = data;
  } catch (e: any) {
    lookupError.value = e?.response?.data?.error || 'Card not found';
  } finally {
    lookupLoading.value = false;
  }
}

async function scanNewCard() {
  registerMsg.value = '';
  try {
    newUid.value = await startScan();
  } catch {
    registerMsg.value      = nfcError.value || 'Scan failed';
    registerMsgClass.value = 'error';
  }
}

async function registerCard() {
  registerLoading.value = true;
  registerMsg.value     = '';
  try {
    await api.post('/nfc/register', { uid: newUid.value, studentId: newStudentId.value });
    registerMsg.value      = `Tag ${newUid.value} linked!`;
    registerMsgClass.value = 'success';
    newUid.value = newStudentId.value = '';
    const { data } = await api.get('/students');
    students.value = data;
  } catch (e: any) {
    registerMsg.value      = e?.response?.data?.error || 'Failed to link tag';
    registerMsgClass.value = 'error';
  } finally {
    registerLoading.value = false;
  }
}

function formatDate(dt: string) {
  return new Date(dt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
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
  background: var(--scl); border-radius: 16px; padding: 16px;
  display: flex; flex-direction: column;
}
.sc-val { font-size: 26px; font-weight: 800; color: var(--sc); margin: 0; }
.sc-lbl { font-size: 12px; color: var(--c-subtext); margin: 4px 0 0; font-weight: 600; }

.section-title {
  font-size: 13px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--c-subtext); padding: 8px 16px 4px;
}

.field-group { margin-bottom: 14px; }
.field-group label {
  display: block; font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--c-subtext); margin-bottom: 6px;
}
.c-input-inline { --background: var(--c-bg); --padding-start: 12px; border-radius: 10px; font-size: 14px; }
.uid-row { display: flex; gap: 8px; align-items: center; }
.lookup-btn { --background: var(--c-green); --border-radius: 10px; height: 44px; flex-shrink: 0; }

.lookup-result { background: var(--c-bg); border-radius: 10px; padding: 12px; margin-top: 10px; }
.lr-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
.lr-row span { color: var(--c-subtext); }
.balance-hi  { color: var(--c-green); font-size: 15px; }

.scan-tile {
  display: flex; align-items: center; gap: 14px;
  background: var(--c-green-light); border-radius: 16px;
  padding: 16px; margin-bottom: 18px; cursor: pointer;
  border: 2px solid transparent; transition: border-color 0.2s;
}
.scan-tile.scanning { border-color: var(--c-green); }
.scan-tile-icon {
  width: 52px; height: 52px; border-radius: 50%;
  background: var(--c-green);
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; color: white; flex-shrink: 0;
}
.scan-tile-title { font-size: 15px; font-weight: 700; margin: 0; color: var(--c-text); }
.scan-tile-sub   { font-size: 12px; color: var(--c-subtext); margin: 3px 0 0; }

.link-btn { --background: var(--c-green); --border-radius: 14px; height: 50px; font-weight: 700; margin-top: 4px; }

.msg { font-size: 13px; font-weight: 600; text-align: center; margin-top: 10px; }
.msg.success { color: var(--c-green); }
.msg.error   { color: var(--c-orange); }

.log-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--c-border); background: var(--c-card);
}
.log-left { display: flex; align-items: center; gap: 10px; }
.log-icon {
  width: 36px; height: 36px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center; font-size: 16px;
  background: var(--c-orange-light); color: var(--c-orange);
}
.log-name  { font-size: 13px; font-weight: 600; margin: 0; }
.log-class { font-weight: 400; color: var(--c-subtext); }
.log-desc  { font-size: 11px; color: var(--c-subtext); margin: 2px 0 0; }
.log-date  { font-size: 11px; color: var(--c-subtext); margin: 2px 0 0; }
.log-amount { font-size: 14px; font-weight: 700; color: var(--c-orange); }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 40px 16px; gap: 8px; color: var(--c-subtext); font-size: 14px; }
.empty-state ion-icon { font-size: 48px; opacity: 0.4; }
.center { display: flex; justify-content: center; padding: 32px; }
</style>
