<template>
  <ion-page>
    <ion-content class="login-content" :fullscreen="true">
      <!-- Hero section -->
      <div class="hero">
        <div class="logo-wrap">
          <div class="logo-icon">
            <ion-icon :icon="cardOutline" />
          </div>
        </div>
        <h1 class="app-name">StudPay</h1>
        <p class="tagline">Smart payments for smart students</p>
      </div>

      <!-- Login card -->
      <div class="login-card fade-up">
        <h2 class="form-title">Welcome back</h2>
        <p class="form-sub">Sign in to your school wallet</p>

        <div class="field-group">
          <label>Email</label>
          <ion-input
            v-model="email"
            type="email"
            placeholder="your@student.school"
            class="sp-input"
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
            class="sp-input"
            @keyup.enter="doLogin"
          />
        </div>

        <ion-button
          expand="block"
          class="login-btn"
          :disabled="loading"
          @click="doLogin"
        >
          <ion-spinner v-if="loading" name="crescent" />
          <span v-else>Sign In</span>
        </ion-button>

        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonContent, IonInput, IonButton, IonSpinner, IonIcon,
} from '@ionic/vue';
import { cardOutline } from 'ionicons/icons';
import { useAuthStore } from '@/store/auth';

const router   = useRouter();
const auth     = useAuthStore();
const email    = ref('');
const pin      = ref('');
const loading  = ref(false);
const errorMsg = ref('');

async function doLogin() {
  if (!email.value || !pin.value) { errorMsg.value = 'Please fill all fields'; return; }
  loading.value  = true;
  errorMsg.value = '';
  try {
    await auth.login(email.value, pin.value.trim());
    router.replace(auth.student?.role === 'shop_owner' ? '/pay' : '/app/wallet');
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || 'Login failed. Check your details.';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-content { --background: linear-gradient(160deg, #6C63FF 0%, #9C8FFF 40%, #F4F3FF 40%); }

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 24px 32px;
  color: white;
}

.logo-wrap {
  width: 80px; height: 80px;
  background: rgba(255,255,255,0.2);
  border-radius: 24px;
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(10px);
  margin-bottom: 16px;
}
.logo-icon { font-size: 42px; color: white; display: flex; }

.app-name { font-size: 36px; font-weight: 800; margin: 0; letter-spacing: -1px; }
.tagline  { font-size: 14px; opacity: 0.85; margin: 6px 0 0; }

.login-card {
  background: white;
  border-radius: 28px 28px 0 0;
  padding: 32px 24px 48px;
  margin-top: -8px;
  min-height: 55vh;
}

.form-title { font-size: 24px; font-weight: 800; margin: 0; color: var(--sp-text); }
.form-sub   { color: var(--sp-subtext); font-size: 14px; margin: 4px 0 28px; }

.field-group { margin-bottom: 18px; }
.field-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--sp-subtext);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sp-input {
  --background: var(--sp-bg);
  --color: var(--sp-text);
  --placeholder-color: #B0B0C8;
  --padding-start: 16px;
  --padding-end: 16px;
  border-radius: 12px;
  font-size: 16px;
}

.login-btn {
  --background: var(--sp-purple);
  --border-radius: 14px;
  height: 54px;
  font-size: 16px;
  font-weight: 700;
  margin-top: 8px;
}

.error-msg {
  color: var(--sp-orange);
  font-size: 13px;
  text-align: center;
  margin-top: 10px;
}
</style>
