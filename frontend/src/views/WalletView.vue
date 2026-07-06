<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>{{ auth.isParent ? 'Parent Portal' : 'My Wallet' }}</ion-title>
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

      <!-- ── PARENT DASHBOARD ── -->
      <template v-if="auth.isParent">
        <div v-if="loading" class="center"><ion-spinner name="crescent" color="primary" /></div>

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

          <div v-if="switchingChild" class="center"><ion-spinner name="crescent" color="primary" /></div>

          <template v-else>
            <!-- Stats -->
            <div class="stats-grid fade-up">
              <div class="stat-card" style="--sc:#6C63FF;--scl:#EDE9FF">
                <p class="sc-val">₹{{ auth.selectedChild?.balance?.toFixed(0) ?? 0 }}</p>
                <p class="sc-lbl">Balance</p>
              </div>
              <div class="stat-card" style="--sc:#00C9A7;--scl:#D6FBF5">
                <p class="sc-val">{{ auth.selectedChild?.card_uid || '—' }}</p>
                <p class="sc-lbl">NFC Card</p>
              </div>
              <div class="stat-card" style="--sc:#FF6B6B;--scl:#FFE8E8">
                <p class="sc-val">₹{{ totalSpent.toFixed(0) }}</p>
                <p class="sc-lbl">Recent Spend</p>
              </div>
              <div class="stat-card" style="--sc:#F6A623;--scl:#FFF3D6">
                <p class="sc-val">₹{{ totalToppedUp.toFixed(0) }}</p>
                <p class="sc-lbl">Recent Top-Ups</p>
              </div>
            </div>

            <!-- Wallet card -->
            <div class="sp-gradient-card fade-up">
              <div class="card-top">
                <div>
                  <p class="card-label">Available Balance</p>
                  <h1 class="balance">₹{{ auth.selectedChild?.balance?.toFixed(2) ?? '0.00' }}</h1>
                </div>
                <div class="avatar">{{ childInitials }}</div>
              </div>
              <div class="card-bottom">
                <div>
                  <p class="card-label">Student</p>
                  <p class="card-value">{{ auth.selectedChild?.name }}</p>
                </div>
                <div>
                  <p class="card-label">Class</p>
                  <p class="card-value">{{ auth.selectedChild?.class }}</p>
                </div>
                <div class="nfc-badge">
                  <ion-icon :icon="wifiOutline" /> {{ auth.selectedChild?.card_uid || 'No card' }}
                </div>
              </div>
            </div>

            <!-- Top up -->
            <p class="section-title">Top Up Wallet</p>
            <div class="sp-card fade-up topup-card">
              <div class="amount-row">
                <span class="rupee">₹</span>
                <input v-model="topupAmount" type="number" placeholder="0" class="amount-input" />
              </div>
              <div class="chip-row">
                <button
                  v-for="a in [50, 100, 200, 500]" :key="a"
                  class="chip-btn" :class="{ active: Number(topupAmount) === a }"
                  @click="topupAmount = String(a)"
                >₹{{ a }}</button>
              </div>
              <button
                class="topup-btn"
                :disabled="!topupAmount || Number(topupAmount) <= 0 || topupLoading"
                @click="doTopup"
              >
                <ion-spinner v-if="topupLoading" name="crescent" />
                <span v-else>Add ₹{{ topupAmount || 0 }} to Wallet</span>
              </button>
              <p v-if="topupMsg" class="topup-msg" :class="topupMsgClass">{{ topupMsg }}</p>
            </div>

            <!-- Recent activity -->
            <p class="section-title">Recent Activity</p>
            <div v-if="childTransactions.length === 0" class="empty-state">
              <ion-icon :icon="receiptOutline" />
              <p>No transactions yet</p>
            </div>
            <div v-else>
              <div v-for="txn in childTransactions.slice(0, 8)" :key="txn.id" class="txn-row fade-up">
                <div class="txn-icon" :class="txn.type">
                  <ion-icon :icon="txn.type === 'credit' ? arrowDownOutline : arrowUpOutline" />
                </div>
                <div class="txn-info">
                  <p class="txn-name">{{ txn.description }}</p>
                  <p class="txn-desc">{{ txn.merchant }}</p>
                  <p class="txn-date">{{ formatDate(txn.created_at) }}</p>
                </div>
                <div class="txn-amt" :class="txn.type">
                  {{ txn.type === 'credit' ? '+' : '-' }}₹{{ txn.amount.toFixed(2) }}
                </div>
              </div>
            </div>
          </template>
        </template>
      </template>

      <!-- ── STUDENT WALLET ── -->
      <template v-else>
        <div class="sp-gradient-card fade-up">
          <div class="card-top">
            <div>
              <p class="card-label">Available Balance</p>
              <h1 class="balance">₹{{ student?.balance?.toFixed(2) ?? '0.00' }}</h1>
            </div>
            <div class="avatar">{{ initials }}</div>
          </div>
          <div class="card-bottom">
            <div>
              <p class="card-label">Student</p>
              <p class="card-value">{{ student?.name }}</p>
            </div>
            <div>
              <p class="card-label">Class</p>
              <p class="card-value">{{ student?.class }}</p>
            </div>
            <div class="nfc-badge">
              <ion-icon :icon="wifiOutline" /> NFC
            </div>
          </div>
        </div>

        <div class="actions-row fade-up" style="margin-bottom:0">
          <div class="action-btn" @click="router.push('/app/history')">
            <div class="ab-icon" style="background:var(--sp-teal-light);color:var(--sp-teal)">
              <ion-icon :icon="listOutline" />
            </div>
            <span>History</span>
          </div>
        </div>

        <p class="section-title">Recent Transactions</p>
        <div v-if="loading" class="center"><ion-spinner name="crescent" color="primary" /></div>
        <div v-else-if="transactions.length === 0" class="empty-state">
          <ion-icon :icon="receiptOutline" /><p>No transactions yet</p>
        </div>
        <div v-else>
          <div v-for="txn in transactions.slice(0, 5)" :key="txn.id" class="txn-row fade-up">
            <div class="txn-icon" :class="txn.type">
              <ion-icon :icon="txn.type === 'credit' ? arrowDownOutline : arrowUpOutline" />
            </div>
            <div class="txn-info">
              <p class="txn-name">{{ txn.description }}</p>
              <p class="txn-desc">{{ txn.merchant }}</p>
              <p class="txn-date">{{ formatDate(txn.created_at) }}</p>
            </div>
            <div class="txn-amt" :class="txn.type">
              {{ txn.type === 'credit' ? '+' : '-' }}₹{{ txn.amount.toFixed(2) }}
            </div>
          </div>
        </div>
      </template>

      <div style="height:24px" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent,
} from '@ionic/vue';
import {
  logOutOutline, wifiOutline, peopleOutline, receiptOutline,
  listOutline, arrowUpOutline, arrowDownOutline,
} from 'ionicons/icons';
import { useAuthStore } from '@/store/auth';
import api from '@/composables/useApi';

const router = useRouter();
const auth   = useAuthStore();
const student   = computed(() => auth.student);
const initials  = computed(() =>
  student.value?.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? 'SP'
);
const childInitials = computed(() =>
  auth.selectedChild?.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? '??'
);
const totalSpent = computed(() =>
  childTransactions.value.filter((t) => t.type === 'debit').reduce((s, t) => s + t.amount, 0)
);
const totalToppedUp = computed(() =>
  childTransactions.value.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0)
);

const loading          = ref(false);
const transactions     = ref<any[]>([]);
const childTransactions = ref<any[]>([]);

const topupAmount    = ref('');
const topupLoading   = ref(false);
const topupMsg       = ref('');
const topupMsgClass  = ref('');
const switchingChild = ref(false);

async function loadChildDetail() {
  if (!auth.selectedChildId) { childTransactions.value = []; return; }
  switchingChild.value = true;
  try {
    const { data } = await api.get(`/parent/child/${auth.selectedChildId}`);
    childTransactions.value = data.transactions;
  } finally {
    switchingChild.value = false;
  }
}

async function loadData() {
  loading.value = true;
  try {
    if (auth.isParent) {
      await auth.loadChildren();
      await loadChildDetail();
    } else {
      const [bRes, hRes] = await Promise.all([
        api.get('/wallet/balance'),
        api.get('/wallet/history'),
      ]);
      auth.updateBalance(bRes.data.balance);
      transactions.value = hRes.data;
    }
  } catch { /* use cached */ }
  finally { loading.value = false; }
}

function selectChild(id: string) {
  auth.selectedChildId = id;
  loadChildDetail();
}

async function doTopup() {
  if (!auth.selectedChildId) return;
  topupLoading.value = true;
  topupMsg.value      = '';
  try {
    const { data } = await api.post('/parent/topup', {
      studentId: auth.selectedChildId,
      amount: Number(topupAmount.value),
    });
    auth.updateChildBalance(auth.selectedChildId, data.newBalance);
    topupMsg.value      = `Success! New balance: ₹${data.newBalance.toFixed(2)}`;
    topupMsgClass.value = 'success';
    topupAmount.value   = '';
    await loadChildDetail();
  } catch (e: any) {
    topupMsg.value      = e?.response?.data?.error || 'Top-up failed';
    topupMsgClass.value = 'error';
  } finally {
    topupLoading.value = false;
  }
}

async function refresh(event: any) { await loadData(); event.target.complete(); }

function logout() { auth.logout(); router.replace('/login'); }

function formatDate(dt: string) {
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

watch(() => auth.selectedChildId, () => loadChildDetail());

onMounted(loadData);
</script>

<style scoped>
.greeting { padding: 20px 20px 8px; }
.greet-sub   { font-size: 13px; color: var(--sp-subtext); margin: 0; }

/* Parent stats grid */
.stats-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 12px; padding: 8px 16px 4px;
}
.stat-card {
  background: var(--scl); border-radius: 18px; padding: 16px;
  display: flex; flex-direction: column; gap: 4px;
}
.sc-val { font-size: 20px; font-weight: 800; color: var(--sc); margin: 0; overflow-wrap: anywhere; }
.sc-lbl { font-size: 12px; color: var(--sp-subtext); margin: 0; font-weight: 600; }
.greet-title { font-size: 28px; font-weight: 800; margin: 4px 0 0; color: var(--sp-text); }

/* Child switcher */
.child-switcher { display: flex; gap: 8px; padding: 16px 16px 4px; overflow-x: auto; }
.child-chip {
  padding: 8px 18px; border-radius: 100px; white-space: nowrap;
  background: white; color: var(--sp-subtext); font-size: 13px; font-weight: 600;
  cursor: pointer; border: 2px solid transparent; box-shadow: var(--sp-shadow);
}
.child-chip.active { background: var(--sp-purple-light); color: var(--sp-purple); border-color: var(--sp-purple); }

/* Top up card */
.topup-card { margin: 4px 16px 0; padding: 16px; }
.amount-row {
  display: flex; align-items: center; gap: 4px;
  background: var(--sp-bg); border-radius: 12px; padding: 0 14px;
}
.rupee { font-size: 22px; font-weight: 700; color: var(--sp-purple); }
.amount-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 28px; font-weight: 800; color: var(--sp-text); padding: 10px 0; width: 100%;
}
.chip-row { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.chip-btn {
  padding: 6px 16px; border-radius: 100px; border: 2px solid transparent;
  background: var(--sp-bg); font-size: 13px; font-weight: 600;
  color: var(--sp-subtext); cursor: pointer;
}
.chip-btn.active { background: var(--sp-purple-light); color: var(--sp-purple); border-color: var(--sp-purple); }
.topup-btn {
  width: 100%; margin-top: 16px; height: 48px; border: none; border-radius: 14px;
  background: var(--sp-purple); color: white; font-size: 15px; font-weight: 700; cursor: pointer;
}
.topup-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.topup-msg { font-size: 13px; font-weight: 600; text-align: center; margin-top: 10px; }
.topup-msg.success { color: var(--sp-teal); }
.topup-msg.error   { color: var(--sp-orange); }

/* Actions */
.section-title {
  font-size: 13px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--sp-subtext); padding: 16px 16px 8px;
}
.actions-row {
  display: flex; gap: 12px; padding: 4px 16px 8px; overflow-x: auto;
}
.action-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  min-width: 68px; cursor: pointer;
}
.action-btn span { font-size: 11px; font-weight: 600; color: var(--sp-subtext); }
.ab-icon {
  width: 54px; height: 54px; border-radius: 16px;
  display: flex; align-items: center; justify-content: center; font-size: 22px;
}

/* Transaction rows */
.txn-row {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border-bottom: 1px solid var(--sp-border);
  background: white;
}
.txn-icon {
  width: 42px; height: 42px; border-radius: 13px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; flex-shrink: 0;
}
.txn-icon.credit { background: var(--sp-teal-light);   color: var(--sp-teal); }
.txn-icon.debit  { background: var(--sp-orange-light);  color: var(--sp-orange); }
.txn-info { flex: 1; min-width: 0; }
.txn-name { font-size: 14px; font-weight: 700; margin: 0; }
.txn-desc { font-size: 12px; color: var(--sp-subtext); margin: 2px 0 0; }
.txn-date { font-size: 11px; color: var(--sp-subtext); margin: 2px 0 0; }
.txn-amt  { font-size: 14px; font-weight: 700; white-space: nowrap; }
.txn-amt.credit { color: var(--sp-teal); }
.txn-amt.debit  { color: var(--sp-orange); }

/* Student wallet card */
.card-top    { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.card-label  { font-size: 12px; opacity: 0.8; margin: 0; }
.balance     { font-size: 38px; font-weight: 800; margin: 4px 0 0; letter-spacing: -1px; }
.avatar      { width: 48px; height: 48px; background: rgba(255,255,255,0.2); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; }
.card-bottom { display: flex; align-items: flex-end; gap: 20px; }
.card-value  { font-size: 14px; font-weight: 600; margin: 2px 0 0; }
.nfc-badge   { margin-left: auto; display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 100px; }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 40px 16px; gap: 8px; color: var(--sp-subtext); font-size: 14px; }
.empty-state ion-icon { font-size: 48px; opacity: 0.4; }
.center { display: flex; justify-content: center; padding: 32px; }
</style>
