<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>{{ auth.isAdmin ? 'Dashboard' : 'My Wallet' }}</ion-title>
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

      <!-- ── ADMIN DASHBOARD ── -->
      <template v-if="auth.isAdmin">
        <div class="greeting fade-up">
          <p class="greet-sub">School Payment System</p>
          <h1 class="greet-title">Overview</h1>
        </div>

        <div v-if="loading" class="center"><ion-spinner name="crescent" color="primary" /></div>

        <template v-else>
          <!-- Stats -->
          <div class="stats-grid fade-up">
            <div class="stat-card" style="--sc:#6C63FF;--scl:#EDE9FF">
              <ion-icon :icon="wifiOutline" class="sc-icon" />
              <p class="sc-val">{{ stats.totalCards }}</p>
              <p class="sc-lbl">NFC Tags</p>
            </div>
            <div class="stat-card" style="--sc:#00C9A7;--scl:#D6FBF5">
              <ion-icon :icon="peopleOutline" class="sc-icon" />
              <p class="sc-val">{{ stats.totalStudents }}</p>
              <p class="sc-lbl">Students</p>
            </div>
            <div class="stat-card" style="--sc:#FF6B6B;--scl:#FFE8E8">
              <ion-icon :icon="receiptOutline" class="sc-icon" />
              <p class="sc-val">{{ stats.todayTransactions }}</p>
              <p class="sc-lbl">Today</p>
            </div>
            <div class="stat-card" style="--sc:#F6A623;--scl:#FFF3D6">
              <ion-icon :icon="cashOutline" class="sc-icon" />
              <p class="sc-val">₹{{ stats.totalRevenue?.toFixed(0) ?? 0 }}</p>
              <p class="sc-lbl">Revenue</p>
            </div>
          </div>

          <!-- Quick actions -->
          <p class="section-title">Quick Actions</p>
          <div class="actions-row fade-up">
            <div class="action-btn" @click="router.push('/app/nfc')">
              <div class="ab-icon" style="background:var(--sp-purple-light);color:var(--sp-purple)">
                <ion-icon :icon="wifiOutline" />
              </div>
              <span>NFC Tags</span>
            </div>
            <div class="action-btn" @click="router.push('/app/students')">
              <div class="ab-icon" style="background:var(--sp-teal-light);color:var(--sp-teal)">
                <ion-icon :icon="peopleOutline" />
              </div>
              <span>Students</span>
            </div>
            <div class="action-btn" @click="router.push('/app/history')">
              <div class="ab-icon" style="background:#FFE8E8;color:#FF6B6B">
                <ion-icon :icon="listOutline" />
              </div>
              <span>History</span>
            </div>
            <div class="action-btn" @click="router.push('/app/admin')">
              <div class="ab-icon" style="background:#FFF3D6;color:#C9860A">
                <ion-icon :icon="settingsOutline" />
              </div>
              <span>Admin</span>
            </div>
          </div>

          <!-- Recent activity -->
          <p class="section-title">Recent Activity</p>
          <div v-if="transactions.length === 0" class="empty-state">
            <ion-icon :icon="receiptOutline" />
            <p>No transactions yet</p>
          </div>
          <div v-else>
            <div v-for="txn in transactions.slice(0, 8)" :key="txn.id" class="txn-row fade-up">
              <div class="txn-icon" :class="txn.type">
                <ion-icon :icon="txn.type === 'credit' ? arrowDownOutline : arrowUpOutline" />
              </div>
              <div class="txn-info">
                <p class="txn-name">{{ txn.student_name }}</p>
                <p class="txn-desc">{{ txn.description }} · {{ txn.merchant }}</p>
                <p class="txn-date">{{ formatDate(txn.created_at) }}</p>
              </div>
              <div class="txn-amt" :class="txn.type">
                {{ txn.type === 'credit' ? '+' : '-' }}₹{{ txn.amount.toFixed(2) }}
              </div>
            </div>
          </div>
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
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent,
} from '@ionic/vue';
import {
  logOutOutline, wifiOutline, peopleOutline, receiptOutline,
  listOutline, settingsOutline, cashOutline,
  arrowUpOutline, arrowDownOutline,
} from 'ionicons/icons';
import { useAuthStore } from '@/store/auth';
import api from '@/composables/useApi';

const router = useRouter();
const auth   = useAuthStore();
const student   = computed(() => auth.student);
const initials  = computed(() =>
  student.value?.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? 'SP'
);

const loading      = ref(false);
const transactions = ref<any[]>([]);
const stats        = ref({ totalStudents: 0, totalCards: 0, totalRevenue: 0, todayTransactions: 0 });

async function loadData() {
  loading.value = true;
  try {
    if (auth.isAdmin) {
      const [sRes, tRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/transactions'),
      ]);
      stats.value        = sRes.data;
      transactions.value = tRes.data;
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

async function refresh(event: any) { await loadData(); event.target.complete(); }

function logout() { auth.logout(); router.replace('/login'); }

function formatDate(dt: string) {
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

onMounted(loadData);
</script>

<style scoped>
.greeting { padding: 20px 20px 8px; }
.greet-sub   { font-size: 13px; color: var(--sp-subtext); margin: 0; }
.greet-title { font-size: 28px; font-weight: 800; margin: 4px 0 0; color: var(--sp-text); }

/* Stats grid */
.stats-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 12px; padding: 8px 16px 4px;
}
.stat-card {
  background: var(--scl); border-radius: 18px; padding: 16px;
  display: flex; flex-direction: column; gap: 4px;
}
.sc-icon { font-size: 22px; color: var(--sc); margin-bottom: 4px; }
.sc-val  { font-size: 26px; font-weight: 800; color: var(--sc); margin: 0; }
.sc-lbl  { font-size: 12px; color: var(--sp-subtext); margin: 0; font-weight: 600; }

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
