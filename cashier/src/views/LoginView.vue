<template>
  <ion-page>
    <ion-content class="login-content" :fullscreen="true">
      <div class="hero">
        <div class="logo-wrap">
          <ion-icon :icon="terminalOutline" class="logo-icon" />
        </div>
        <h1 class="app-name">StudPay</h1>
        <p class="tagline">Cashier Terminal</p>
      </div>

      <div class="login-card fade-up">
        <h2 class="form-title">Staff Sign In</h2>
        <p class="form-sub">Use your school admin account</p>

        <div class="field-group">
          <label>Email</label>
          <ion-input
            v-model="email"
            type="email"
            placeholder="admin@studpay.school"
            class="c-input"
            autocomplete="email"
          />
        </div>

        <div class="field-group">
          <label>PIN</label>
          <ion-input
            v-model="pin"
            type="password"
            placeholder="4-digit PIN"
            :maxlength="4"
            class="c-input"
            @keyup.enter="doLogin"
          />
        </div>

        <ion-button expand="block" class="login-btn" :disabled="loading" @click="doLogin">
          <ion-spinner v-if="loading" name="crescent" />
          <span v-else>Open Terminal</span>
        </ion-button>

        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

        <div class="demo-hint">
          <ion-icon :icon="informationCircleOutline" />
          <span>Demo: <strong>admin@studpay.school</strong> / PIN <strong>1234</strong></span>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonPage, IonContent, IonInput, IonButton, IonSpinner, IonIcon } from '@ionic/vue';
import { terminalOutline, informationCircleOutline } from 'ionicons/icons';
import { useCashierStore } from '@/store/cashier';

const router   = useRouter();
const store    = useCashierStore();
const email    = ref('admin@studpay.school');
const pin      = ref('1234');
const loading  = ref(false);
const errorMsg = ref('');

async function doLogin() {
  if (!email.value || !pin.value) { errorMsg.value = 'Please fill all fields'; return; }
  loading.value  = true;
  errorMsg.value = '';
  try {
    await store.login(email.value, pin.value.trim());
    router.replace('/pay');
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || e?.message || 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-content { --background: linear-gradient(160deg, #1B998B 0%, #2DCAB8 40%, var(--c-bg) 40%); }

.hero {
  display: flex; flex-direction: column; align-items: center;
  padding: 60px 24px 32px; color: white;
}
.logo-wrap {
  width: 80px; height: 80px;
  background: rgba(255,255,255,0.2);
  border-radius: 24px;
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(10px);
  margin-bottom: 16px;
}
.logo-icon { font-size: 40px; color: white; }
.app-name  { font-size: 36px; font-weight: 800; margin: 0; letter-spacing: -1px; }
.tagline   { font-size: 14px; opacity: 0.85; margin: 6px 0 0; letter-spacing: 0.1em; text-transform: uppercase; }

.login-card {
  background: white; border-radius: 28px 28px 0 0;
  padding: 32px 24px 48px; margin-top: -8px; min-height: 55vh;
}
.form-title { font-size: 24px; font-weight: 800; margin: 0; color: var(--c-text); }
.form-sub   { color: var(--c-subtext); font-size: 14px; margin: 4px 0 28px; }

.field-group { margin-bottom: 18px; }
.field-group label {
  display: block; font-size: 13px; font-weight: 600;
  color: var(--c-subtext); margin-bottom: 6px;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.c-input {
  --background: var(--c-bg); --color: var(--c-text);
  --placeholder-color: #9BB5B2; --padding-start: 16px; --padding-end: 16px;
  border-radius: 12px; font-size: 16px;
}

.login-btn {
  --background: var(--c-green); --border-radius: 14px;
  height: 54px; font-size: 16px; font-weight: 700; margin-top: 8px;
}

.error-msg {
  color: var(--c-orange); font-size: 13px; text-align: center; margin-top: 10px;
}

.demo-hint {
  display: flex; align-items: center; gap: 6px;
  justify-content: center; margin-top: 20px;
  font-size: 12px; color: var(--c-subtext);
}
</style>
