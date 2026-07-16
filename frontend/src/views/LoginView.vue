<template>
  <ion-page>
    <ion-content class="login-content" :fullscreen="true">
      <!-- Hero section -->
      <div class="hero">
        <div class="hero-orb orb-one" />
        <div class="hero-orb orb-two" />
        <div class="logo-wrap">
          <div class="logo-icon">
            <ion-icon :icon="cardOutline" />
          </div>
        </div>
        <h1 class="app-name">StudPay</h1>
        <p class="tagline">One calm place for campus payments and wellbeing.</p>
        <div class="hero-pills"><span><ion-icon :icon="shieldCheckmarkOutline" /> Secure wallet</span><span><ion-icon :icon="sparklesOutline" /> Smart insights</span></div>
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

        <p class="switch-link">
          New here? <a @click="router.push('/register')">Create an Account</a>
        </p>

        <div class="trust-row"><div><ion-icon :icon="peopleOutline" /><span>For parents</span></div><i /><div><ion-icon :icon="storefrontOutline" /><span>For canteens</span></div><i /><div><ion-icon :icon="schoolOutline" /><span>For schools</span></div></div>
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
import { cardOutline, shieldCheckmarkOutline, sparklesOutline, peopleOutline, storefrontOutline, schoolOutline } from 'ionicons/icons';
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
    const role = auth.student?.role;
    if (role === 'super_admin') router.replace('/platform');
    else if (role === 'shop_owner' || role === 'cashier') router.replace('/pay');
    else if (role === 'school_admin') router.replace('/admin/dashboard');
    else router.replace('/app/wallet');
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error || 'Login failed. Check your details.';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-content { --background: #1e2146; }

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px 26px;
  color: white;
  position: relative;
  overflow: hidden;
  background: radial-gradient(circle at 12% 20%, rgba(46,230,198,.26), transparent 25%), linear-gradient(145deg, #1d2149, #5639d4 60%, #7b61ff);
}
.hero-orb { position:absolute; border-radius:50%; border:1px solid rgba(255,255,255,.2); }.orb-one { height:160px; width:160px; top:-94px; right:-38px; }.orb-two { height:95px; width:95px; bottom:-48px; left:-22px; background:rgba(46,230,198,.13); }

.logo-wrap {
  width: 80px; height: 80px;
  background: rgba(255,255,255,0.2);
  border-radius: 24px;
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(10px);
  margin-bottom: 16px;
  position:relative; z-index:1;
}
.logo-icon { font-size: 42px; color: white; display: flex; }

.app-name { font-size: 36px; font-weight: 800; margin: 0; letter-spacing: -1px; position:relative; z-index:1; }
.tagline  { font-size: 13px; opacity: .84; margin: 7px 0 0; max-width:270px; text-align:center; line-height:1.4; position:relative; z-index:1; }
.hero-pills { display:flex; gap:7px; margin-top:18px; position:relative; z-index:1; }.hero-pills span { display:flex; align-items:center; gap:4px; padding:5px 8px; border:1px solid rgba(255,255,255,.18); border-radius:99px; background:rgba(255,255,255,.1); font-size:10px; font-weight:700; }.hero-pills ion-icon { font-size:13px; color:#8ffff0; }

.login-card {
  background: white;
  border-radius: 28px 28px 0 0;
  padding: 32px 24px 48px;
  margin-top: -8px;
  min-height: 54vh;
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

.switch-link {
  text-align: center; font-size: 13px; color: var(--sp-subtext); margin-top: 18px;
}
.switch-link a { color: var(--sp-purple); font-weight: 700; cursor: pointer; }
.trust-row { display:flex; align-items:center; justify-content:center; gap:10px; margin-top:26px; color:var(--sp-subtext); }.trust-row div { display:flex; flex-direction:column; align-items:center; gap:4px; font-size:9px; font-weight:700; }.trust-row ion-icon { color:var(--sp-purple); font-size:16px; }.trust-row i { width:1px; height:23px; background:var(--sp-border); }
</style>
