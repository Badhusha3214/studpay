<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Students</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="showAdd = true">
            <ion-icon :icon="personAddOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div class="search-wrap">
        <ion-searchbar
          v-model="query"
          placeholder="Search students..."
          :debounce="200"
          class="sp-search"
        />
      </div>

      <div v-if="loading" class="center">
        <ion-spinner name="crescent" color="primary" />
      </div>

      <div v-else>
        <div
          v-for="stu in filtered"
          :key="stu.id"
          class="stu-card fade-up"
          @click="openStudent(stu)"
        >
          <div class="stu-avatar">{{ initials(stu.name) }}</div>
          <div class="stu-info">
            <p class="stu-name">{{ stu.name }}</p>
            <p class="stu-meta">{{ stu.class }} · {{ stu.email }}</p>
            <div class="stu-badges">
              <span v-if="stu.card_uid" class="badge nfc">
                <ion-icon :icon="wifiOutline" /> {{ stu.card_uid }}
              </span>
              <span v-else class="badge no-card">No card</span>
            </div>
          </div>
          <div class="stu-balance">
            <p class="sb-label">Balance</p>
            <p class="sb-val">₹{{ stu.balance?.toFixed(2) }}</p>
          </div>
        </div>

        <div v-if="filtered.length === 0" class="empty-state">
          <ion-icon :icon="peopleOutline" />
          <p>No students found</p>
        </div>
      </div>

      <div style="height: 24px" />
    </ion-content>

    <!-- Add student modal -->
    <ion-modal :is-open="showAdd" @didDismiss="showAdd = false">
      <ion-page>
        <ion-header>
          <ion-toolbar>
            <ion-title>Add Student</ion-title>
            <ion-buttons slot="end"><ion-button @click="showAdd = false">Close</ion-button></ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <div class="add-form">
            <div class="field-group">
              <label>Full Name</label>
              <ion-input v-model="form.name" placeholder="e.g. Priya Nair" class="sp-input-sm" />
            </div>
            <div class="field-group">
              <label>Email</label>
              <ion-input v-model="form.email" type="email" placeholder="priya@student.school" class="sp-input-sm" />
            </div>
            <div class="field-group">
              <label>Class / Grade</label>
              <ion-input v-model="form.class" placeholder="e.g. 10-B" class="sp-input-sm" />
            </div>
            <div class="field-group">
              <label>Initial PIN (4 digits)</label>
              <ion-input v-model="form.pin" type="password" :maxlength="4" placeholder="Set a PIN" class="sp-input-sm" />
            </div>
            <div class="field-group">
              <label>Starting Balance (₹)</label>
              <ion-input v-model="form.balance" type="number" placeholder="0" class="sp-input-sm" />
            </div>
            <ion-button
              expand="block"
              class="add-stu-btn"
              :disabled="!form.name || !form.email || !form.class || !form.pin || addLoading"
              @click="addStudent"
            >
              <ion-spinner v-if="addLoading" name="crescent" />
              <span v-else>Create Student Account</span>
            </ion-button>
            <p v-if="addMsg" class="add-msg" :class="addMsgClass">{{ addMsg }}</p>
          </div>
        </ion-content>
      </ion-page>
    </ion-modal>

    <!-- Student detail modal -->
    <ion-modal :is-open="showDetail" @didDismiss="showDetail = false">
      <ion-page>
        <ion-header>
          <ion-toolbar>
            <ion-title>{{ detailStu?.name }}</ion-title>
            <ion-buttons slot="end"><ion-button @click="showDetail = false">Close</ion-button></ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <div class="detail-header">
            <div class="detail-avatar">{{ initials(detailStu?.name || '') }}</div>
            <div>
              <p class="detail-name">{{ detailStu?.name }}</p>
              <p class="detail-meta">{{ detailStu?.class }} · ID: {{ detailStu?.id }}</p>
              <div class="detail-badges">
                <span v-if="detailStu?.card_uid" class="badge nfc"><ion-icon :icon="wifiOutline" /> {{ detailStu?.card_uid }}</span>
                <span v-else class="badge no-card">No NFC card</span>
              </div>
            </div>
          </div>

          <div class="detail-balance">
            <p class="db-label">Current Balance</p>
            <p class="db-val">₹{{ detailStu?.balance?.toFixed(2) }}</p>
          </div>

          <p class="sp-section-title" style="margin-top: 12px">Spending Breakdown</p>
          <div v-if="detailData?.spendingBreakdown?.length" class="breakdown-list">
            <div v-for="item in detailData.spendingBreakdown" :key="item.category" class="breakdown-row">
              <span>{{ item.category }}</span>
              <strong>₹{{ item.total.toFixed(2) }}</strong>
            </div>
          </div>
          <p v-else class="empty-sub">No spending data yet</p>

          <p class="sp-section-title" style="margin-top: 12px">Recent Transactions</p>
          <div v-for="txn in detailData?.transactions?.slice(0, 10)" :key="txn.id" class="txn-row-sm">
            <div class="txn-ico-sm" :class="txn.type === 'credit' ? 'c' : 'd'">
              {{ txn.type === 'credit' ? '↓' : '↑' }}
            </div>
            <div class="txn-info-sm">
              <p>{{ txn.description }}</p>
              <span>{{ txn.merchant }} · {{ fmtDate(txn.created_at) }}</span>
            </div>
            <div class="txn-amt-sm" :class="txn.type === 'credit' ? 'c' : 'd'">
              {{ txn.type === 'credit' ? '+' : '-' }}₹{{ txn.amount.toFixed(2) }}
            </div>
          </div>
          <div style="height: 24px" />
        </ion-content>
      </ion-page>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent, IonSearchbar, IonModal, IonInput,
} from '@ionic/vue';
import { personAddOutline, wifiOutline, peopleOutline } from 'ionicons/icons';
import api from '@/composables/useApi';

const students   = ref<any[]>([]);
const loading    = ref(false);
const query      = ref('');

const showAdd    = ref(false);
const addLoading = ref(false);
const addMsg     = ref('');
const addMsgClass = ref('');
const form = reactive({ name: '', email: '', class: '', pin: '', balance: '' });

const showDetail = ref(false);
const detailStu  = ref<any>(null);
const detailData = ref<any>(null);

const filtered = computed(() => {
  const q = query.value.toLowerCase();
  return students.value.filter(s =>
    !q || s.name?.toLowerCase().includes(q) ||
    s.email?.toLowerCase().includes(q) ||
    s.class?.toLowerCase().includes(q)
  );
});

async function load() {
  loading.value = true;
  try { const { data } = await api.get('/students'); students.value = data; }
  finally { loading.value = false; }
}

async function refresh(e: any) { await load(); e.target.complete(); }

async function addStudent() {
  addLoading.value = true; addMsg.value = '';
  try {
    await api.post('/students', {
      name: form.name, email: form.email,
      class: form.class, pin: form.pin,
      balance: Number(form.balance) || 0,
    });
    addMsg.value      = 'Student created successfully!';
    addMsgClass.value = 'success';
    Object.assign(form, { name: '', email: '', class: '', pin: '', balance: '' });
    await load();
    setTimeout(() => { showAdd.value = false; }, 1200);
  } catch (e: any) {
    addMsg.value      = e?.response?.data?.error || 'Failed to create student';
    addMsgClass.value = 'error';
  } finally { addLoading.value = false; }
}

async function openStudent(stu: any) {
  detailStu.value  = stu;
  showDetail.value = true;
  const { data } = await api.get(`/students/${stu.id}`);
  detailData.value = data;
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}
function fmtDate(dt: string) {
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

onMounted(load);
</script>

<style scoped>
.search-wrap { padding: 12px 12px 4px; }
.sp-search { --background: white; --border-radius: 14px; --box-shadow: var(--sp-shadow); }

.stu-card {
  display: flex; align-items: center; gap: 12px;
  background: white; border-radius: 16px;
  margin: 6px 14px; padding: 14px;
  box-shadow: var(--sp-shadow); cursor: pointer;
}
.stu-avatar {
  width: 46px; height: 46px; border-radius: 14px;
  background: var(--sp-purple-light); color: var(--sp-purple);
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; font-weight: 700; flex-shrink: 0;
}
.stu-info { flex: 1; min-width: 0; }
.stu-name { font-size: 15px; font-weight: 700; margin: 0; }
.stu-meta { font-size: 12px; color: var(--sp-subtext); margin: 2px 0 4px; }
.stu-badges { display: flex; gap: 6px; flex-wrap: wrap; }
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 100px;
}
.badge.nfc     { background: var(--sp-purple-light); color: var(--sp-purple); font-family: monospace; }
.badge.no-card { background: var(--sp-border); color: var(--sp-subtext); }
.stu-balance { text-align: right; }
.sb-label { font-size: 11px; color: var(--sp-subtext); margin: 0; }
.sb-val   { font-size: 16px; font-weight: 800; color: var(--sp-purple); margin: 2px 0 0; }

/* Add form */
.add-form { padding: 4px 0; }
.field-group { margin-bottom: 14px; }
.field-group label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--sp-subtext); margin-bottom: 5px; }
.sp-input-sm { --background: var(--sp-bg); --padding-start: 12px; border-radius: 10px; font-size: 14px; }
.add-stu-btn { --background: var(--sp-purple); --border-radius: 14px; height: 50px; font-weight: 700; }
.add-msg { font-size: 13px; font-weight: 600; text-align: center; margin-top: 10px; }
.add-msg.success { color: var(--sp-teal); } .add-msg.error { color: var(--sp-orange); }

/* Detail modal */
.detail-header {
  display: flex; align-items: center; gap: 14px;
  background: var(--sp-purple); color: white;
  padding: 20px 16px;
}
.detail-avatar {
  width: 56px; height: 56px; border-radius: 16px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 700;
}
.detail-name  { font-size: 18px; font-weight: 800; margin: 0; }
.detail-meta  { font-size: 12px; opacity: .85; margin: 3px 0 6px; }
.detail-badges { display: flex; gap: 6px; }
.detail-balance {
  text-align: center; background: white;
  margin: 12px 14px; border-radius: 14px;
  padding: 14px; box-shadow: var(--sp-shadow);
}
.db-label { font-size: 11px; color: var(--sp-subtext); margin: 0; text-transform: uppercase; letter-spacing: .05em; }
.db-val   { font-size: 32px; font-weight: 800; color: var(--sp-purple); margin: 4px 0 0; }

.breakdown-list { padding: 0 16px; }
.breakdown-row {
  display: flex; justify-content: space-between;
  padding: 10px 0; border-bottom: 1px solid var(--sp-border);
  font-size: 13px;
}
.breakdown-row span { color: var(--sp-subtext); }

.txn-row-sm { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--sp-border); }
.txn-ico-sm { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
.txn-ico-sm.c { background: var(--sp-teal-light); color: var(--sp-teal); }
.txn-ico-sm.d { background: var(--sp-orange-light); color: var(--sp-orange); }
.txn-info-sm { flex: 1; }
.txn-info-sm p { font-size: 13px; font-weight: 600; margin: 0; }
.txn-info-sm span { font-size: 11px; color: var(--sp-subtext); }
.txn-amt-sm { font-size: 13px; font-weight: 700; }
.txn-amt-sm.c { color: var(--sp-teal); } .txn-amt-sm.d { color: var(--sp-orange); }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 48px 16px; gap: 10px; color: var(--sp-subtext); font-size: 14px; }
.empty-state ion-icon { font-size: 52px; opacity: 0.4; }
.empty-sub { text-align: center; color: var(--sp-subtext); font-size: 13px; padding: 12px 16px; }
.center { display: flex; justify-content: center; padding: 32px; }
</style>
