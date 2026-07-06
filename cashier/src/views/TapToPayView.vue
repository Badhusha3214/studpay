<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>{{ store.cashier?.merchant_name || 'Cashier Terminal' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="router.push('/dashboard')">
            <ion-icon :icon="statsChartOutline" slot="icon-only" />
          </ion-button>
          <ion-button @click="logout">
            <ion-icon :icon="logOutOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- NFC ring -->
      <div class="scan-hero">
        <div class="nfc-ring" :class="{ 'nfc-pulse': scanning }">
          <div class="nfc-inner">
            <ion-icon :icon="wifiOutline" class="nfc-icon" />
          </div>
        </div>
        <h2 class="scan-title">{{ scanning ? 'Waiting for card...' : 'Ready to Accept Payment' }}</h2>
        <p class="scan-sub">{{ scanning ? 'Ask student to tap their ID card' : 'Enter amount then scan student ID' }}</p>
      </div>

      <!-- Amount + description -->
      <div class="c-card fade-up">
        <p class="field-label">Description</p>
        <ion-input v-model="description" placeholder="e.g. Lunch combo" class="c-input-inline" @ionInput="selectedItemId = null" />

        <p class="field-label" style="margin-top:16px">Amount (₹)</p>
        <div class="amount-row">
          <span class="rupee">₹</span>
          <ion-input v-model="amount" type="number" placeholder="0" class="amount-input" @ionInput="selectedItemId = null" />
        </div>

        <div class="chip-row">
          <div
            v-for="a in [20, 30, 50, 100]" :key="a"
            class="amt-chip" :class="{ active: !selectedItemId && Number(amount) === a }"
            @click="pickQuickAmount(a)"
          >₹{{ a }}</div>
        </div>
      </div>

      <!-- Menu items -->
      <div v-if="groupedItems.length" class="c-card fade-up menu-card">
        <p class="field-label">Menu Items</p>
        <div v-for="group in groupedItems" :key="group.category" class="item-group">
          <div class="item-group-label">
            <span class="cat-dot" :style="{ background: CATEGORY_COLORS[group.category] }" />
            {{ CATEGORY_LABELS[group.category] }}
          </div>
          <div class="chip-row">
            <div
              v-for="item in group.items" :key="item.id"
              class="item-chip" :class="{ active: selectedItemId === item.id }"
              @click="pickItem(item)"
            >{{ item.name }} · ₹{{ item.price }}</div>
          </div>
        </div>
      </div>

      <div class="btn-wrap">
        <ion-button
          expand="block" class="scan-btn"
          :disabled="!amount || Number(amount) <= 0 || scanning"
          @click="startScanFlow"
        >
          <ion-icon :icon="wifiOutline" slot="start" />
          {{ scanning ? 'Scanning...' : 'Scan Student Card' }}
        </ion-button>
      </div>

      <p v-if="statusMsg" class="status-msg" :class="statusClass">{{ statusMsg }}</p>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonContent, IonInput, IonIcon,
} from '@ionic/vue';
import { wifiOutline, logOutOutline, statsChartOutline } from 'ionicons/icons';
import { useNfc } from '@/composables/useNfc';
import { useCashierStore } from '@/store/cashier';
import api from '@/composables/useApi';

interface MenuItem { id: string; name: string; category: string; price: number; active: number }

const CATEGORY_ORDER  = ['junk', 'healthy', 'beverage', 'snack', 'meal', 'other'];
const CATEGORY_COLORS: Record<string, string> = {
  junk: '#2a78d6', healthy: '#1baf7a', beverage: '#eda100',
  snack: '#008300', meal: '#4a3aa7', other: '#9a9a94',
};
const CATEGORY_LABELS: Record<string, string> = {
  junk: 'Junk Food', healthy: 'Healthy', beverage: 'Beverage',
  snack: 'Snack', meal: 'Meal', other: 'Other',
};

const router  = useRouter();
const store   = useCashierStore();
const { scanning, startScan, error: nfcError } = useNfc();

const amount         = ref('');
const description    = ref('');
const statusMsg      = ref('');
const statusClass    = ref('');
const menuItems      = ref<MenuItem[]>([]);
const selectedItemId = ref<string | null>(null);

const groupedItems = computed(() => CATEGORY_ORDER
  .map((category) => ({ category, items: menuItems.value.filter((i) => i.category === category && i.active) }))
  .filter((g) => g.items.length > 0));

async function loadMenuItems() {
  try {
    const { data } = await api.get('/menu/items');
    menuItems.value = data;
  } catch { /* menu items are optional — billing still works with free-text amounts */ }
}

function pickItem(item: MenuItem) {
  selectedItemId.value = item.id;
  amount.value         = String(item.price);
  description.value    = item.name;
}

function pickQuickAmount(a: number) {
  selectedItemId.value = null;
  amount.value          = String(a);
}

async function startScanFlow() {
  statusMsg.value = '';
  if (!amount.value || Number(amount.value) <= 0) return;

  try {
    const uid = await startScan();

    // Look up the student linked to this NFC tag
    const { data } = await api.post('/nfc/lookup', { uid });
    const student = data.student;

    store.setPending(Number(amount.value), description.value || 'Payment', selectedItemId.value);
    store.setScanned(uid, {
      name: student.name,
      class: student.class,
      balance: student.balance,
      allergies: student.allergies,
      uid,
    });

    statusMsg.value   = `Card detected — ${student.name}`;
    statusClass.value = 'success';

    setTimeout(() => router.push('/pin'), 600);
  } catch (e: any) {
    statusMsg.value   = e?.response?.data?.error || nfcError.value || 'Card not found or scan failed';
    statusClass.value = 'error';
  }
}

function logout() {
  store.logout();
  router.replace('/login');
}

onMounted(loadMenuItems);
</script>

<style scoped>
.scan-hero {
  display: flex; flex-direction: column; align-items: center;
  padding: 36px 24px 20px;
}

.nfc-ring {
  width: 140px; height: 140px; border-radius: 50%;
  background: var(--c-green-light);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 20px; position: relative;
}
.nfc-ring::before {
  content: ''; position: absolute; inset: -10px;
  border-radius: 50%; border: 2px dashed rgba(27,153,139,0.25);
}
.nfc-inner {
  width: 100px; height: 100px; border-radius: 50%;
  background: var(--c-green);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 24px rgba(27,153,139,0.4);
}
.nfc-icon { font-size: 46px; color: white; transform: rotate(90deg); }

.scan-title { font-size: 20px; font-weight: 800; margin: 0; color: var(--c-text); text-align: center; }
.scan-sub   { font-size: 13px; color: var(--c-subtext); text-align: center; margin: 6px 0 0; }

.field-label {
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--c-subtext); margin: 0 0 6px;
}
.c-input-inline { --background: var(--c-bg); --padding-start: 14px; border-radius: 10px; font-size: 15px; }

.amount-row {
  display: flex; align-items: center; gap: 4px;
  background: var(--c-bg); border-radius: 12px; padding: 0 14px;
}
.rupee { font-size: 22px; font-weight: 700; color: var(--c-green); }
.amount-input { flex: 1; --background: transparent; font-size: 28px; font-weight: 800; --color: var(--c-text); }

.chip-row { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.amt-chip {
  padding: 6px 16px; border-radius: 100px;
  background: var(--c-bg); font-size: 13px; font-weight: 600;
  color: var(--c-subtext); cursor: pointer; border: 2px solid transparent; transition: all 0.15s;
}
.amt-chip.active { background: var(--c-green-light); color: var(--c-green); border-color: var(--c-green); }

.menu-card { margin-top: 12px; }
.item-group { margin-top: 14px; }
.item-group:first-of-type { margin-top: 8px; }
.item-group-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--c-subtext); margin-bottom: 8px;
}
.cat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.item-chip {
  padding: 6px 14px; border-radius: 100px;
  background: var(--c-bg); font-size: 13px; font-weight: 600;
  color: var(--c-subtext); cursor: pointer; border: 2px solid transparent; transition: all 0.15s;
}
.item-chip.active { background: var(--c-green-light); color: var(--c-green); border-color: var(--c-green); }

.btn-wrap { padding: 0 16px; margin-top: 8px; }
.scan-btn {
  --background: linear-gradient(135deg, var(--c-green) 0%, #2DCAB8 100%);
  --border-radius: 16px; height: 56px; font-size: 16px; font-weight: 700;
}

.status-msg { text-align: center; font-size: 13px; font-weight: 600; padding: 8px 16px; }
.status-msg.success { color: var(--c-green); }
.status-msg.error   { color: var(--c-orange); }
</style>
