<template>
  <template>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="router.push('/admin/dashboard')">
            <ion-icon :icon="arrowBackOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
        <ion-title>Shops</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="processing" class="processing-overlay">
        <ion-spinner name="crescent" color="light" />
      </div>

      <p class="sp-section-title">Add Shop</p>
      <div class="sp-card fade-up create-card">
        <div class="form-group">
          <label>Shop Name</label>
          <input v-model="form.name" placeholder="e.g. Sports Store" class="form-input" />
        </div>
        <div class="form-group">
          <label>Location / Counter (optional)</label>
          <input v-model="form.location" placeholder="e.g. Ground Floor, Gate 2" class="form-input" />
        </div>
        <ion-button expand="block" class="link-btn" :disabled="!form.name || createLoading" @click="createShop">
          <ion-spinner v-if="createLoading" name="crescent" />
          <span v-else>Add Shop</span>
        </ion-button>
        <p v-if="createMsg" class="form-msg" :class="createMsgClass">{{ createMsg }}</p>
      </div>

      <p class="sp-section-title">{{ shops.length }} shop{{ shops.length === 1 ? '' : 's' }}</p>

      <div v-if="loading" class="center"><ion-spinner name="crescent" color="primary" /></div>

      <div v-else class="shops-list">
        <div v-for="s in shops" :key="s.id" class="shop-row fade-up" :class="{ inactive: !s.active }">
          <div class="shop-icon"><ion-icon :icon="storefrontOutline" /></div>
          <div class="shop-info">
            <p class="shop-name">{{ s.name }}</p>
            <p class="shop-meta">{{ s.location || 'No location set' }}</p>
          </div>
          <span class="badge" :class="s.active ? 'active-badge' : 'inactive-badge'">{{ s.active ? 'Active' : 'Inactive' }}</span>
          <button class="action-btn" title="Edit" @click="editShop(s)">
            <ion-icon :icon="createOutline" />
          </button>
          <button class="action-btn" :title="s.active ? 'Deactivate' : 'Activate'" @click="toggleActive(s)">
            <ion-icon :icon="s.active ? banOutline : refreshOutline" />
          </button>
        </div>
      </div>

      <div style="height: 24px" />
    </ion-content>
  </template>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonIcon, IonSpinner, alertController,
} from '@ionic/vue';
import {
  arrowBackOutline, storefrontOutline, createOutline, banOutline, refreshOutline,
} from 'ionicons/icons';
import api from '@/composables/useApi';

interface Shop {
  id: string; name: string; location: string | null; active: number;
}

const router = useRouter();

const shops      = ref<Shop[]>([]);
const loading    = ref(true);
const processing = ref(false);

const form           = ref({ name: '', location: '' });
const createLoading  = ref(false);
const createMsg      = ref('');
const createMsgClass = ref('');

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/shops');
    shops.value = data;
  } catch (err: any) {
    console.error('Failed to load shops:', err?.response?.data?.error || err.message);
  } finally {
    loading.value = false;
  }
}

async function createShop() {
  createLoading.value = true;
  createMsg.value = '';
  try {
    await api.post('/admin/shops', { name: form.value.name, location: form.value.location || undefined });
    createMsg.value      = 'Shop added!';
    createMsgClass.value = 'success';
    form.value = { name: '', location: '' };
    await load();
  } catch (e: any) {
    createMsg.value      = e?.response?.data?.error || 'Failed to add shop';
    createMsgClass.value = 'error';
  } finally {
    createLoading.value = false;
  }
}

async function editShop(s: Shop) {
  const alert = await alertController.create({
    header: 'Edit Shop',
    inputs: [
      { name: 'name', type: 'text', value: s.name, placeholder: 'Shop name' },
      { name: 'location', type: 'text', value: s.location || '', placeholder: 'Location / counter' },
    ],
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Save', handler: async (vals) => {
          processing.value = true;
          try {
            await api.patch(`/admin/shops/${s.id}`, { name: vals.name || undefined, location: vals.location });
            await load();
          } catch (err: any) {
            console.error('Failed to update shop:', err?.response?.data?.error || err.message);
          } finally {
            processing.value = false;
          }
        },
      },
    ],
  });
  await alert.present();
}

async function toggleActive(s: Shop) {
  processing.value = true;
  try {
    await api.patch(`/admin/shops/${s.id}`, { active: !s.active });
    await load();
  } catch (err: any) {
    console.error('Failed to toggle shop:', err?.response?.data?.error || err.message);
  } finally {
    processing.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.processing-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
}
.create-card { padding: 16px; }
.form-group { margin-bottom: 14px; }
.form-group label {
  display: block; font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--sp-subtext); margin-bottom: 6px;
}
.form-input {
  width: 100%; padding: 12px 14px; border-radius: 12px;
  border: 2px solid var(--sp-border); background: var(--sp-bg);
  font-size: 14px; color: var(--sp-text); outline: none; box-sizing: border-box;
}
.form-input:focus { border-color: var(--sp-purple); }

.link-btn { --background: var(--sp-purple); --border-radius: 14px; height: 48px; font-weight: 700; margin-top: 4px; }
.form-msg { font-size: 13px; font-weight: 600; text-align: center; margin-top: 10px; }
.form-msg.success { color: var(--sp-teal); }
.form-msg.error   { color: var(--sp-orange); }

.shops-list { padding: 4px 0; }
.shop-row {
  display: flex; align-items: center; gap: 12px;
  background: white; border-radius: 16px;
  margin: 6px 14px; padding: 14px;
  box-shadow: var(--sp-shadow);
}
.shop-row.inactive { opacity: 0.55; }
.shop-icon {
  width: 42px; height: 42px; border-radius: 12px;
  background: var(--sp-purple-light); color: var(--sp-purple);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; flex-shrink: 0;
}
.shop-info { flex: 1; min-width: 0; }
.shop-name { font-size: 14px; font-weight: 700; margin: 0; }
.shop-meta { font-size: 12px; color: var(--sp-subtext); margin: 2px 0 0; }

.badge { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 100px; flex-shrink: 0; }
.badge.active-badge { background: var(--sp-teal-light); color: var(--sp-teal); }
.badge.inactive-badge { background: var(--sp-orange-light); color: var(--sp-orange); }

.action-btn {
  width: 36px; height: 36px; border-radius: 10px; border: none;
  background: var(--sp-bg); color: var(--sp-subtext);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; cursor: pointer; flex-shrink: 0;
}

.center { display: flex; justify-content: center; padding: 32px; }
ion-content { --background: var(--sp-bg); }
</style>
