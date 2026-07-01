<template>
  <ion-page>
    <ion-content :fullscreen="true" class="receipt-content">
      <div class="receipt-wrap">
        <!-- Success ring -->
        <div class="success-ring fade-up">
          <div class="success-circle">
            <ion-icon :icon="checkmarkOutline" class="check-icon" />
          </div>
        </div>

        <h2 class="success-title">Payment Done!</h2>
        <p class="success-sub">Transaction complete</p>

        <!-- Receipt -->
        <div class="receipt-card fade-up">
          <div class="receipt-header">
            <span>StudPay Receipt</span>
            <span>{{ formatDate(txn?.created_at) }}</span>
          </div>

          <div class="receipt-amount">₹{{ txn?.amount?.toFixed(2) }}</div>

          <div class="receipt-rows">
            <div class="r-row">
              <span>Student</span>
              <strong>{{ store.scannedStudent?.name }}</strong>
            </div>
            <div class="r-row">
              <span>Merchant</span>
              <strong>{{ txn?.merchant }}</strong>
            </div>
            <div class="r-row">
              <span>Description</span>
              <strong>{{ txn?.description }}</strong>
            </div>
            <div class="r-row">
              <span>Transaction ID</span>
              <span class="txn-id">{{ txn?.id?.slice(0, 8).toUpperCase() }}</span>
            </div>
            <div class="r-row balance-row">
              <span>New Balance</span>
              <strong>₹{{ txn?.balance_after?.toFixed(2) }}</strong>
            </div>
          </div>
        </div>

        <ion-button expand="block" class="next-btn" @click="nextPayment">
          Next Payment
        </ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { IonPage, IonContent, IonButton, IonIcon } from '@ionic/vue';
import { checkmarkOutline } from 'ionicons/icons';
import { useCashierStore } from '@/store/cashier';

const router = useRouter();
const store  = useCashierStore();
const txn    = computed(() => store.lastTransaction);

function formatDate(dt?: string) {
  if (!dt) return '';
  return new Date(dt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function nextPayment() {
  store.reset();
  router.replace('/pay');
}
</script>

<style scoped>
.receipt-content { --background: var(--c-bg); }

.receipt-wrap {
  display: flex; flex-direction: column; align-items: center;
  padding: 48px 20px 32px;
}

.success-ring {
  width: 120px; height: 120px; border-radius: 50%;
  background: var(--c-green-light);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 20px;
}
.success-circle {
  width: 88px; height: 88px; border-radius: 50%;
  background: var(--c-green);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 24px rgba(27,153,139,0.4);
}
.check-icon { font-size: 44px; color: white; }

.success-title { font-size: 26px; font-weight: 800; margin: 0; color: var(--c-text); }
.success-sub   { font-size: 14px; color: var(--c-subtext); margin: 4px 0 24px; }

.receipt-card {
  background: white; border-radius: 20px;
  box-shadow: var(--c-shadow-lg);
  width: 100%; max-width: 360px; overflow: hidden; margin-bottom: 24px;
}
.receipt-header {
  display: flex; justify-content: space-between;
  background: var(--c-green); color: white;
  padding: 12px 16px; font-size: 12px; font-weight: 600;
}
.receipt-amount {
  text-align: center; font-size: 42px; font-weight: 800;
  color: var(--c-text); padding: 20px 0; letter-spacing: -1px;
}
.receipt-rows { padding: 0 16px 16px; }
.r-row {
  display: flex; justify-content: space-between;
  padding: 10px 0; border-top: 1px solid var(--c-border); font-size: 13px;
}
.r-row span:first-child { color: var(--c-subtext); }
.r-row strong { font-weight: 600; }
.txn-id       { font-family: monospace; font-size: 12px; }
.balance-row strong { color: var(--c-green); font-size: 15px; }

.next-btn {
  --background: var(--c-green); --border-radius: 14px;
  width: 100%; max-width: 360px; height: 52px;
  font-size: 16px; font-weight: 700;
}
</style>
