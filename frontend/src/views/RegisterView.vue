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

      <!-- Register card -->
      <div class="login-card fade-up">
        <h2 class="form-title">Create Account</h2>
        <p class="form-sub">Sign up as a parent or a shop owner</p>

        <div class="role-toggle">
          <button
            type="button" class="role-btn" :class="{ active: role === 'parent' }"
            @click="role = 'parent'"
          >Parent</button>
          <button
            type="button" class="role-btn" :class="{ active: role === 'shop_owner' }"
            @click="role = 'shop_owner'"
          >Shop Owner</button>
        </div>

        <div class="field-group">
          <label>Full Name</label>
          <ion-input v-model="name" placeholder="e.g. Lakshmi Menon" class="sp-input" autocomplete="name" />
        </div>

        <div class="field-group">
          <label>Email</label>
          <ion-input
            v-model="email" type="email" placeholder="you@example.com"
            class="sp-input" autocomplete="email"
          />
        </div>

        <div v-if="role === 'shop_owner'" class="field-group">
          <label>Shop / Merchant Name</label>
          <ion-input v-model="merchantName" placeholder="e.g. School Canteen" class="sp-input" />
        </div>

        <div v-if="role === 'parent'" class="field-group">
          <label>Contact Phone (optional)</label>
          <ion-input v-model="phone" type="tel" placeholder="e.g. 9876543210" class="sp-input" />
        </div>

        <div class="field-group">
          <label>PIN</label>
          <ion-input
            v-model="pin" type="password" placeholder="4-6 digit PIN"
            :maxlength="6" class="sp-input"
          />
        </div>

        <ion-button
          expand="block" class="login-btn" :disabled="loading"
          @click="doRegister"
        >
          <ion-spinner v-if="loading" name="crescent" />
          <span v-else>Create Account</span>
        </ion-button>

        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

        <p class="switch-link">
          Already have an account? <a @click="router.push('/login')">Sign In</a>
        </p>
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

const router = useRouter();
const auth   = useAuthStore();

const role         = ref<'parent' | 'shop_owner'>('parent');
const name         = ref('');
const email        = ref('');
const phone        = ref('');
const merchantName = ref('');
const pin          = ref('');
const loading      = ref(false);
const errorMsg     = ref('');

async function doRegister() {
  if (!name.value || !email.value || !pin.value) {
    errorMsg.value = 'Please fill all required fields';
    return;
  }
  if (role.value === 'shop_owner' && !merchantName.value) {
    errorMsg.value = 'Shop / merchant name is required';
    return;
  }

  loading.value  = true;
  errorMsg.value = '';
  try {
    await auth.register({
      name: name.value,
      email: email.value,
      pin: pin.value.trim(),
      role: role.value,
      phone: phone.value || undefined,
      merchantName: merchantName.value || undefined,
    });
    router.replace(auth.student?.role === 'shop_owner' ? '/pay' : '/app/wallet');
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || 'Registration failed. Please try again.';
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
.form-sub   { color: var(--sp-subtext); font-size: 14px; margin: 4px 0 22px; }

.role-toggle {
  display: flex; gap: 8px; background: var(--sp-bg);
  border-radius: 12px; padding: 4px; margin-bottom: 20px;
}
.role-btn {
  flex: 1; border: none; background: transparent; cursor: pointer;
  padding: 10px 0; border-radius: 9px; font-size: 14px; font-weight: 700;
  color: var(--sp-subtext);
}
.role-btn.active { background: var(--sp-purple); color: white; }

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

.switch-link {
  text-align: center; font-size: 13px; color: var(--sp-subtext); margin-top: 18px;
}
.switch-link a { color: var(--sp-purple); font-weight: 700; cursor: pointer; }
</style>
