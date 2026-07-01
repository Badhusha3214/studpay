<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>NFC Tags</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <!-- Search -->
      <div class="search-wrap">
        <div class="search-box">
          <ion-icon :icon="searchOutline" class="search-icon" />
          <input v-model="query" placeholder="Search name, UID, class..." class="search-input" />
        </div>
      </div>

      <!-- Stats strip -->
      <div class="stats-strip fade-up">
        <div class="ss-item">
          <div class="ss-dot active" />
          <span>{{ cards.filter(c => c.active).length }} Active</span>
        </div>
        <div class="ss-sep" />
        <div class="ss-item">
          <div class="ss-dot inactive" />
          <span>{{ cards.filter(c => !c.active).length }} Inactive</span>
        </div>
        <div class="ss-sep" />
        <div class="ss-item">
          <ion-icon :icon="wifiOutline" style="color:var(--sp-purple);font-size:14px" />
          <span>{{ cards.length }} Total</span>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="center">
        <ion-spinner name="crescent" color="primary" />
      </div>

      <!-- Empty state -->
      <div v-else-if="filtered.length === 0" class="empty-state">
        <div class="empty-icon-wrap">
          <ion-icon :icon="wifiOutline" class="empty-icon" />
        </div>
        <h3 class="empty-title">No NFC Tags Yet</h3>
        <p class="empty-sub">Tap the + button below to add your first tag</p>
        <ion-button class="empty-btn" @click="showAdd = true">
          <ion-icon :icon="addOutline" slot="start" />
          Add NFC Tag
        </ion-button>
      </div>

      <!-- Cards list -->
      <div v-else class="cards-list">
        <div v-for="card in filtered" :key="card.id" class="nfc-card fade-up">

          <!-- UID row -->
          <div class="uid-row">
            <div class="uid-chip" :class="card.active ? 'active' : 'inactive'">
              <ion-icon :icon="wifiOutline" />
              <span>{{ card.uid }}</span>
            </div>
            <div class="card-status" :class="card.active ? 'active' : 'inactive'">
              {{ card.active ? 'Active' : 'Inactive' }}
            </div>
          </div>

          <!-- Student info -->
          <div class="student-row">
            <div class="stu-avatar">{{ initials(card.name) }}</div>
            <div class="stu-info">
              <p class="stu-name">{{ card.name }}</p>
              <p class="stu-meta">{{ card.class }} · {{ card.email }}</p>
            </div>
            <div class="stu-balance">
              <p class="bal-label">Balance</p>
              <p class="bal-val">₹{{ card.balance?.toFixed(2) }}</p>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="card-actions">
            <button class="ca-btn topup" @click="openTopup(card)">
              <ion-icon :icon="addCircleOutline" />
              Top Up
            </button>
            <button class="ca-btn history" @click="openHistory(card)">
              <ion-icon :icon="receiptOutline" />
              History
            </button>
            <button class="ca-btn toggle" @click="toggleCard(card)">
              <ion-icon :icon="card.active ? pauseOutline : playOutline" />
              {{ card.active ? 'Deactivate' : 'Activate' }}
            </button>
            <button class="ca-btn remove" @click="deleteCard(card)">
              <ion-icon :icon="trashOutline" />
            </button>
          </div>
        </div>
      </div>

      <div style="height: 100px" />
    </ion-content>

    <!-- FAB — big obvious add button -->
    <ion-fab vertical="bottom" horizontal="center" slot="fixed">
      <ion-fab-button class="add-fab" @click="showAdd = true">
        <ion-icon :icon="addOutline" />
      </ion-fab-button>
    </ion-fab>

    <!-- ── ADD TAG MODAL ── -->
    <ion-modal :is-open="showAdd" @didDismiss="closeAdd">
      <ion-page>
        <ion-header>
          <ion-toolbar>
            <ion-title>Add NFC Tag</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="closeAdd">
                <ion-icon :icon="closeOutline" slot="icon-only" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">

          <!-- Scan option -->
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

          <div class="divider"><span>or type manually</span></div>

          <div class="form-group">
            <label>Card UID</label>
            <input v-model="newUid" placeholder="e.g. A1B2C3D4" class="form-input" />
          </div>

          <div class="form-group">
            <label>Student ID</label>
            <input v-model="newStudentId" placeholder="e.g. stu-001" class="form-input" />
            <p class="form-hint">Find the Student ID in the Students tab</p>
          </div>

          <ion-button
            expand="block"
            class="link-btn"
            :disabled="!newUid || !newStudentId || addLoading"
            @click="addCard"
          >
            <ion-spinner v-if="addLoading" name="crescent" />
            <template v-else>
              <ion-icon :icon="linkOutline" slot="start" />
              Link Tag to Student
            </template>
          </ion-button>

          <p v-if="addMsg" class="form-msg" :class="addMsgClass">{{ addMsg }}</p>
        </ion-content>
      </ion-page>
    </ion-modal>

    <!-- ── HISTORY MODAL ── -->
    <ion-modal :is-open="showHistory" @didDismiss="showHistory = false">
      <ion-page>
        <ion-header>
          <ion-toolbar>
            <ion-title>{{ historyCard?.name }}</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="showHistory = false">
                <ion-icon :icon="closeOutline" slot="icon-only" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <div class="history-uid">
            <ion-icon :icon="wifiOutline" />
            <span>{{ historyCard?.uid }}</span>
          </div>

          <div v-if="cardHistory.length === 0" class="empty-state" style="padding:40px">
            <ion-icon :icon="receiptOutline" style="font-size:48px;opacity:.3" />
            <p>No transactions yet</p>
          </div>

          <div v-for="txn in cardHistory" :key="txn.id" class="h-txn-row">
            <div class="h-txn-ico" :class="txn.type">
              <ion-icon :icon="txn.type === 'credit' ? arrowDownOutline : arrowUpOutline" />
            </div>
            <div class="h-txn-info">
              <p>{{ txn.description }}</p>
              <span>{{ txn.merchant }} · {{ fmtDate(txn.created_at) }}</span>
            </div>
            <div class="h-txn-amt" :class="txn.type">
              {{ txn.type === 'credit' ? '+' : '-' }}₹{{ txn.amount.toFixed(2) }}
            </div>
          </div>
          <div style="height:24px" />
        </ion-content>
      </ion-page>
    </ion-modal>

    <!-- ── TOP UP MODAL ── -->
    <ion-modal :is-open="showTopup" @didDismiss="showTopup = false">
      <ion-page>
        <ion-header>
          <ion-toolbar>
            <ion-title>Top Up</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="showTopup = false">
                <ion-icon :icon="closeOutline" slot="icon-only" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <div class="topup-student">
            <div class="ts-avatar">{{ initials(topupCard?.name || '') }}</div>
            <div>
              <p class="ts-name">{{ topupCard?.name }}</p>
              <p class="ts-bal">Current balance: <strong>₹{{ topupCard?.balance?.toFixed(2) }}</strong></p>
            </div>
          </div>

          <p class="amount-label">Amount to add</p>
          <div class="big-amount-row">
            <span class="big-rupee">₹</span>
            <input v-model="topupAmt" type="number" placeholder="0" class="big-amount-input" />
          </div>

          <div class="chips">
            <button
              v-for="a in [50, 100, 200, 500]" :key="a"
              class="chip-btn" :class="{ active: Number(topupAmt) === a }"
              @click="topupAmt = String(a)"
            >₹{{ a }}</button>
          </div>

          <div class="form-group" style="margin-top:20px">
            <label>Note (optional)</label>
            <input v-model="topupNote" placeholder="e.g. Weekly allowance" class="form-input" />
          </div>

          <ion-button
            expand="block"
            class="topup-btn"
            :disabled="!topupAmt || Number(topupAmt) <= 0 || topupLoading"
            @click="doTopup"
          >
            <ion-spinner v-if="topupLoading" name="crescent" />
            <span v-else>Add ₹{{ topupAmt || 0 }} to Wallet</span>
          </ion-button>

          <p v-if="topupMsg" class="form-msg" :class="topupMsgClass">{{ topupMsg }}</p>
        </ion-content>
      </ion-page>
    </ion-modal>

  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent, IonModal, IonFab, IonFabButton,
  alertController, toastController,
} from '@ionic/vue';
import {
  addOutline, wifiOutline, receiptOutline, trashOutline, searchOutline,
  addCircleOutline, pauseOutline, playOutline, closeOutline, linkOutline,
  arrowDownOutline, arrowUpOutline,
} from 'ionicons/icons';
import api from '@/composables/useApi';
import { useNfc } from '@/composables/useNfc';

const { startScan, scanning: nfcScanning } = useNfc();

const cards   = ref<any[]>([]);
const loading = ref(false);
const query   = ref('');

const showAdd      = ref(false);
const newUid       = ref('');
const newStudentId = ref('');
const addLoading   = ref(false);
const addMsg       = ref('');
const addMsgClass  = ref('');

const showHistory = ref(false);
const historyCard = ref<any>(null);
const cardHistory = ref<any[]>([]);

const showTopup    = ref(false);
const topupCard    = ref<any>(null);
const topupAmt     = ref('');
const topupNote    = ref('');
const topupLoading = ref(false);
const topupMsg     = ref('');
const topupMsgClass = ref('');

const filtered = computed(() => {
  const q = query.value.toLowerCase();
  return cards.value.filter(c =>
    !q ||
    c.name?.toLowerCase().includes(q) ||
    c.uid?.toLowerCase().includes(q) ||
    c.class?.toLowerCase().includes(q) ||
    c.email?.toLowerCase().includes(q)
  );
});

async function load() {
  loading.value = true;
  try { const { data } = await api.get('/nfc/cards'); cards.value = data; }
  finally { loading.value = false; }
}

async function refresh(event: any) { await load(); event.target.complete(); }

function closeAdd() {
  showAdd.value = false;
  newUid.value = newStudentId.value = addMsg.value = '';
}

async function scanNewCard() {
  try { newUid.value = await startScan(); } catch { /* handled */ }
}

async function addCard() {
  addLoading.value = true; addMsg.value = '';
  try {
    await api.post('/nfc/register', { uid: newUid.value, studentId: newStudentId.value });
    addMsg.value      = `Tag ${newUid.value} linked!`;
    addMsgClass.value = 'success';
    newUid.value = newStudentId.value = '';
    await load();
    setTimeout(() => { showAdd.value = false; addMsg.value = ''; }, 1500);
  } catch (e: any) {
    addMsg.value      = e?.response?.data?.error || 'Failed to link tag';
    addMsgClass.value = 'error';
  } finally { addLoading.value = false; }
}

async function toggleCard(card: any) {
  await api.patch(`/nfc/cards/${card.id}/toggle`);
  card.active = !card.active;
}

async function deleteCard(card: any) {
  const alert = await alertController.create({
    header: 'Remove Tag',
    message: `Remove tag ${card.uid} from ${card.name}?`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Remove', role: 'destructive',
        handler: async () => {
          await api.delete(`/nfc/cards/${card.id}`);
          cards.value = cards.value.filter(c => c.id !== card.id);
        },
      },
    ],
  });
  await alert.present();
}

async function openHistory(card: any) {
  historyCard.value = card;
  showHistory.value = true;
  const { data } = await api.get(`/students/${card.student_id}/card-history`);
  cardHistory.value = data;
}

function openTopup(card: any) {
  topupCard.value = card;
  topupAmt.value = topupNote.value = topupMsg.value = '';
  showTopup.value = true;
}

async function doTopup() {
  topupLoading.value = true; topupMsg.value = '';
  try {
    const { data } = await api.post('/parent/topup', {
      studentId: topupCard.value.student_id,
      amount: Number(topupAmt.value),
      note: topupNote.value,
    });
    topupCard.value.balance = data.newBalance;
    topupMsg.value      = `Done! New balance: ₹${data.newBalance.toFixed(2)}`;
    topupMsgClass.value = 'success';
    await load();
  } catch (e: any) {
    topupMsg.value      = e?.response?.data?.error || 'Top-up failed';
    topupMsgClass.value = 'error';
  } finally { topupLoading.value = false; }
}

function initials(name: string) {
  return name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? '??';
}
function fmtDate(dt: string) {
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

onMounted(load);
</script>

<style scoped>
/* Search */
.search-wrap { padding: 14px 16px 8px; }
.search-box {
  display: flex; align-items: center; gap: 10px;
  background: white; border-radius: 14px; padding: 12px 16px;
  box-shadow: var(--sp-shadow);
}
.search-icon  { font-size: 18px; color: var(--sp-subtext); flex-shrink: 0; }
.search-input {
  border: none; outline: none; background: transparent;
  font-size: 15px; color: var(--sp-text); flex: 1; width: 100%;
}
.search-input::placeholder { color: var(--sp-subtext); }

/* Stats strip */
.stats-strip {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px 12px; font-size: 13px; font-weight: 600; color: var(--sp-subtext);
}
.ss-item { display: flex; align-items: center; gap: 6px; }
.ss-dot  { width: 8px; height: 8px; border-radius: 50%; }
.ss-dot.active   { background: var(--sp-teal); }
.ss-dot.inactive { background: var(--sp-border); }
.ss-sep  { width: 1px; height: 14px; background: var(--sp-border); }

/* Empty state */
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 60px 24px; gap: 12px; }
.empty-icon-wrap {
  width: 88px; height: 88px; border-radius: 28px;
  background: var(--sp-purple-light);
  display: flex; align-items: center; justify-content: center;
}
.empty-icon  { font-size: 44px; color: var(--sp-purple); }
.empty-title { font-size: 20px; font-weight: 800; margin: 0; color: var(--sp-text); }
.empty-sub   { font-size: 14px; color: var(--sp-subtext); margin: 0; text-align: center; }
.empty-btn   { --background: var(--sp-purple); --border-radius: 14px; height: 50px; font-weight: 700; margin-top: 4px; }

/* Cards */
.cards-list { padding: 4px 0; }
.nfc-card {
  background: white; border-radius: 20px;
  margin: 8px 14px; padding: 16px;
  box-shadow: var(--sp-shadow);
}

/* UID row */
.uid-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.uid-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 100px;
  font-size: 13px; font-weight: 700; font-family: monospace;
}
.uid-chip.active   { background: var(--sp-purple-light); color: var(--sp-purple); }
.uid-chip.inactive { background: var(--sp-border); color: var(--sp-subtext); }
.card-status {
  font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 100px;
}
.card-status.active   { background: #D6FBF5; color: #00916A; }
.card-status.inactive { background: var(--sp-border); color: var(--sp-subtext); }

/* Student row */
.student-row { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.stu-avatar {
  width: 46px; height: 46px; border-radius: 14px;
  background: var(--sp-purple-light); color: var(--sp-purple);
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; font-weight: 700; flex-shrink: 0;
}
.stu-info { flex: 1; min-width: 0; }
.stu-name { font-size: 15px; font-weight: 700; margin: 0; }
.stu-meta { font-size: 12px; color: var(--sp-subtext); margin: 2px 0 0; }
.stu-balance { text-align: right; }
.bal-label { font-size: 11px; color: var(--sp-subtext); margin: 0; }
.bal-val   { font-size: 18px; font-weight: 800; color: var(--sp-purple); margin: 2px 0 0; }

/* Action buttons row */
.card-actions {
  display: flex; gap: 8px;
  border-top: 1px solid var(--sp-border); padding-top: 12px;
}
.ca-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 12px; border-radius: 10px; border: none;
  font-size: 12px; font-weight: 700; cursor: pointer; transition: opacity 0.15s;
}
.ca-btn:active { opacity: 0.7; }
.ca-btn ion-icon { font-size: 15px; }
.ca-btn.topup   { background: var(--sp-teal-light);   color: var(--sp-teal); flex: 1; justify-content: center; }
.ca-btn.history { background: var(--sp-purple-light); color: var(--sp-purple); flex: 1; justify-content: center; }
.ca-btn.toggle  { background: #FFF3D6; color: #C9860A; flex: 1; justify-content: center; }
.ca-btn.remove  { background: var(--sp-orange-light); color: var(--sp-orange); padding: 7px 10px; }

/* FAB */
.add-fab {
  --background: var(--sp-purple);
  --background-activated: var(--sp-purple-dark);
  --box-shadow: 0 6px 24px rgba(108,99,255,0.45);
  width: 60px; height: 60px;
}

/* Add modal */
.scan-tile {
  display: flex; align-items: center; gap: 14px;
  background: var(--sp-purple-light); border-radius: 16px;
  padding: 16px; margin-bottom: 20px; cursor: pointer;
  border: 2px solid transparent; transition: border-color 0.2s;
}
.scan-tile.scanning { border-color: var(--sp-purple); }
.scan-tile-icon {
  width: 52px; height: 52px; border-radius: 50%;
  background: var(--sp-purple);
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; color: white; flex-shrink: 0;
}
.scan-tile-title { font-size: 15px; font-weight: 700; margin: 0; color: var(--sp-text); }
.scan-tile-sub   { font-size: 12px; color: var(--sp-subtext); margin: 3px 0 0; }

.divider {
  display: flex; align-items: center; gap: 10px;
  color: var(--sp-subtext); font-size: 12px; margin: 0 0 18px;
}
.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--sp-border); }

.form-group { margin-bottom: 16px; }
.form-group label {
  display: block; font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .05em;
  color: var(--sp-subtext); margin-bottom: 7px;
}
.form-input {
  width: 100%; padding: 13px 14px; border-radius: 12px;
  border: 2px solid var(--sp-border); background: var(--sp-bg);
  font-size: 15px; color: var(--sp-text); outline: none;
  box-sizing: border-box; transition: border-color 0.2s;
}
.form-input:focus { border-color: var(--sp-purple); }
.form-hint { font-size: 11px; color: var(--sp-subtext); margin: 6px 0 0; }
.link-btn  { --background: var(--sp-purple); --border-radius: 14px; height: 52px; font-weight: 700; margin-top: 8px; }
.form-msg  { font-size: 13px; font-weight: 600; text-align: center; margin-top: 12px; }
.form-msg.success { color: var(--sp-teal); }
.form-msg.error   { color: var(--sp-orange); }

/* History modal */
.history-uid {
  display: flex; align-items: center; gap: 8px;
  background: var(--sp-purple-light); color: var(--sp-purple);
  padding: 12px 16px; font-size: 13px; font-weight: 700; font-family: monospace;
}
.h-txn-row { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--sp-border); }
.h-txn-ico { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
.h-txn-ico.credit { background: var(--sp-teal-light); color: var(--sp-teal); }
.h-txn-ico.debit  { background: var(--sp-orange-light); color: var(--sp-orange); }
.h-txn-info { flex: 1; }
.h-txn-info p    { font-size: 13px; font-weight: 600; margin: 0; }
.h-txn-info span { font-size: 11px; color: var(--sp-subtext); }
.h-txn-amt { font-size: 14px; font-weight: 700; white-space: nowrap; }
.h-txn-amt.credit { color: var(--sp-teal); }
.h-txn-amt.debit  { color: var(--sp-orange); }

/* Top up modal */
.topup-student {
  display: flex; align-items: center; gap: 14px;
  background: var(--sp-bg); border-radius: 14px; padding: 14px; margin-bottom: 20px;
}
.ts-avatar {
  width: 48px; height: 48px; border-radius: 14px;
  background: var(--sp-purple-light); color: var(--sp-purple);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 700;
}
.ts-name { font-size: 16px; font-weight: 700; margin: 0; }
.ts-bal  { font-size: 13px; color: var(--sp-subtext); margin: 3px 0 0; }
.ts-bal strong { color: var(--sp-purple); }

.amount-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--sp-subtext); margin: 0 0 8px; }
.big-amount-row { display: flex; align-items: center; background: var(--sp-bg); border-radius: 14px; padding: 8px 16px; margin-bottom: 12px; }
.big-rupee { font-size: 26px; font-weight: 700; color: var(--sp-purple); margin-right: 4px; }
.big-amount-input { flex: 1; border: none; background: transparent; font-size: 34px; font-weight: 800; color: var(--sp-text); outline: none; width: 100%; }

.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip-btn {
  padding: 7px 18px; border-radius: 100px;
  background: var(--sp-bg); border: 2px solid transparent;
  font-size: 13px; font-weight: 700; color: var(--sp-subtext); cursor: pointer;
}
.chip-btn.active { background: var(--sp-purple-light); color: var(--sp-purple); border-color: var(--sp-purple); }

.topup-btn { --background: var(--sp-teal); --border-radius: 14px; height: 52px; font-weight: 700; margin-top: 8px; }

.center { display: flex; justify-content: center; padding: 40px; }
</style>
