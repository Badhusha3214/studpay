<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/pay" text="" />
        </ion-buttons>
        <ion-title>Student PIN</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="pin-container">
        <!-- Student info card -->
        <div class="student-card fade-up">
          <div class="student-avatar">{{ initials }}</div>
          <div class="student-info">
            <p class="student-name">{{ store.scannedStudent?.name }}</p>
            <p class="student-class">{{ store.scannedStudent?.class }}</p>
            <p class="student-balance">Balance: ₹{{ store.scannedStudent?.balance?.toFixed(2) }}</p>
          </div>
          <div class="charge-badge">
            <p class="charge-label">Charging</p>
            <p class="charge-amount">₹{{ store.pendingAmount.toFixed(2) }}</p>
          </div>
        </div>

        <div v-if="store.scannedStudent?.allergies" class="allergy-banner fade-up">
          <ion-icon :icon="warningOutline" />
          <span>Allergy: {{ store.scannedStudent.allergies }}</span>
        </div>

        <!-- Waiting for parent approval (junk-food hold for young students) -->
        <template v-if="pending">
          <div class="waiting-card fade-up">
            <ion-spinner name="crescent" />
            <p class="waiting-title">Waiting for Parent Approval</p>
            <p class="waiting-sub">
              This purchase auto-approves in {{ secondsLeft }}s unless a parent rejects it.
            </p>
          </div>
        </template>

        <template v-else-if="rejected">
          <div class="rejected-card fade-up">
            <ion-icon :icon="closeCircleOutline" />
            <p class="rejected-title">Purchase Rejected</p>
            <p class="rejected-sub">The parent rejected this purchase. It was not charged.</p>
            <ion-button expand="block" class="back-btn" @click="router.replace('/pay')">Back to Terminal</ion-button>
          </div>
        </template>

        <template v-else>
          <!-- PIN dots -->
          <p class="pin-prompt">Student: enter your PIN to confirm</p>
          <div class="pin-dots">
            <div v-for="i in 4" :key="i" class="pin-dot" :class="{ filled: entered.length >= i }" />
          </div>

          <p v-if="errorMsg" class="pin-error">{{ errorMsg }}</p>

          <!-- Keypad -->
          <div class="keypad">
            <template v-for="key in keys" :key="key">
              <div
                class="pin-key"
                :class="{ danger: key === '⌫', confirm: key === '✓', empty: key === '' }"
                @click="pressKey(key)"
              >
                <span>{{ key }}</span>
              </div>
            </template>
          </div>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle,
  IonButtons, IonBackButton, IonContent, IonIcon, IonSpinner, IonButton,
} from '@ionic/vue';
import { warningOutline, closeCircleOutline } from 'ionicons/icons';
import { useCashierStore } from '@/store/cashier';
import api from '@/composables/useApi';

const router   = useRouter();
const store    = useCashierStore();
const entered  = ref('');
const errorMsg = ref('');
const loading  = ref(false);

const pending      = ref<{ id: string; expiresAt: string } | null>(null);
const rejected     = ref(false);
const secondsLeft  = ref(0);
let pollTimer: ReturnType<typeof setInterval> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;

const keys = ['1','2','3','4','5','6','7','8','9','⌫','0','✓'];

const initials = computed(() =>
  store.scannedStudent?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '??'
);

function pressKey(key: string) {
  if (loading.value) return;
  if (key === '⌫') { entered.value = entered.value.slice(0, -1); errorMsg.value = ''; return; }
  if (key === '✓')  { confirm(); return; }
  if (key === '')   return;
  if (entered.value.length < 4) entered.value += key;
  if (entered.value.length === 4) confirm();
}

// Cart checkouts return one row per line — collapse them into a single
// combined summary for the receipt screen, which only shows one total.
function applyPaymentResult(data: any) {
  const txn = data.transactions
    ? {
        id: data.transactions[0].id,
        amount: data.transactions.reduce((sum: number, t: any) => sum + t.amount, 0),
        description: store.pendingDesc,
        merchant: data.transactions[0].merchant,
        balance_after: data.transactions[data.transactions.length - 1].balance_after,
        emergency_amount: data.transactions.reduce((sum: number, t: any) => sum + (t.emergency_amount || 0), 0),
        created_at: data.transactions[0].created_at,
      }
    : data.transaction;

  store.setLastTransaction({
    ...txn,
    created_at: txn.created_at || new Date().toISOString(),
  });

  if (store.scannedStudent) {
    store.scannedStudent.balance = data.student.newBalance;
  }

  router.replace('/receipt');
}

function stopTimers() {
  if (pollTimer) clearInterval(pollTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  pollTimer = null;
  countdownTimer = null;
}

function startWaitingFor(pendingId: string, expiresAt: string) {
  pending.value = { id: pendingId, expiresAt };

  const tick = () => {
    secondsLeft.value = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
  };
  tick();
  countdownTimer = setInterval(tick, 1000);

  pollTimer = setInterval(async () => {
    try {
      const { data } = await api.get(`/wallet/pending/${pendingId}`);
      if (data.status === 'approved') {
        stopTimers();
        pending.value = null;
        applyPaymentResult(data);
      } else if (data.status === 'rejected') {
        stopTimers();
        pending.value = null;
        rejected.value = true;
      }
    } catch { /* transient network error — keep polling */ }
  }, 3000);
}

onUnmounted(stopTimers);

async function confirm() {
  if (entered.value.length < 4) { errorMsg.value = 'Enter 4-digit PIN'; return; }
  loading.value  = true;
  errorMsg.value = '';

  try {
    const { data } = await api.post('/wallet/pay-by-nfc', {
      uid:         store.scannedUid,
      pin:         entered.value,
      amount:      store.pendingAmount,
      description: store.pendingDesc,
      cart:        store.pendingCart,
      merchant:    store.cashier?.merchant_name,
    });

    if (data.status === 'pending') {
      startWaitingFor(data.pendingId, data.expiresAt);
      return;
    }

    applyPaymentResult(data);
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || 'Invalid PIN. Try again.';
    entered.value  = '';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.pin-container {
  display: flex; flex-direction: column; align-items: center;
  padding: 20px 16px 32px;
}

.student-card {
  display: flex; align-items: center; gap: 14px;
  background: white; border-radius: 20px;
  box-shadow: var(--c-shadow); padding: 18px;
  width: 100%; max-width: 380px; margin-bottom: 28px;
}
.student-avatar {
  width: 52px; height: 52px; border-radius: 16px;
  background: var(--c-green-light); color: var(--c-green);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 700; flex-shrink: 0;
}
.student-info { flex: 1; }
.student-name    { font-size: 16px; font-weight: 800; margin: 0; color: var(--c-text); }
.student-class   { font-size: 12px; color: var(--c-subtext); margin: 2px 0; }
.student-balance { font-size: 12px; color: var(--c-subtext); margin: 0; }
.charge-badge    { text-align: right; }
.charge-label    { font-size: 11px; color: var(--c-subtext); margin: 0; text-transform: uppercase; }
.charge-amount   { font-size: 22px; font-weight: 800; color: var(--c-green); margin: 2px 0 0; }

.pin-prompt { font-size: 13px; color: var(--c-subtext); margin: 0 0 16px; text-align: center; }

.pin-dots { display: flex; gap: 16px; margin-bottom: 8px; }

.pin-error {
  color: var(--c-orange); font-size: 13px; font-weight: 600;
  margin: 4px 0 16px;
}

.allergy-banner {
  display: flex; align-items: center; gap: 8px;
  background: #FFF3D6; color: #B45309;
  border-radius: 12px; padding: 10px 14px;
  font-size: 13px; font-weight: 700;
  width: 100%; max-width: 380px; margin: -14px 0 20px;
}
.allergy-banner ion-icon { font-size: 18px; flex-shrink: 0; }

.waiting-card {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  background: white; border-radius: 20px; box-shadow: var(--c-shadow);
  padding: 32px 24px; width: 100%; max-width: 380px; text-align: center;
}
.waiting-title { font-size: 16px; font-weight: 800; margin: 8px 0 0; color: var(--c-text); }
.waiting-sub   { font-size: 13px; color: var(--c-subtext); margin: 4px 0 0; }

.rejected-card {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  background: white; border-radius: 20px; box-shadow: var(--c-shadow);
  padding: 32px 24px; width: 100%; max-width: 380px; text-align: center;
}
.rejected-card ion-icon { font-size: 44px; color: var(--c-orange); }
.rejected-title { font-size: 16px; font-weight: 800; margin: 8px 0 0; color: var(--c-text); }
.rejected-sub   { font-size: 13px; color: var(--c-subtext); margin: 4px 0 16px; }
.back-btn { --background: var(--c-green); --border-radius: 12px; width: 100%; }

.keypad {
  display: grid; grid-template-columns: repeat(3, 72px);
  gap: 16px; margin-top: 16px;
}
</style>
