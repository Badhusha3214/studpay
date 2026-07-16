<template>
  <template>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>NFC Cards</ion-title>
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

      <div v-if="processing" class="processing-overlay">
        <ion-spinner name="crescent" color="light" />
      </div>

      <div class="sp-card fade-up filter-card">
        <input v-model="q" placeholder="Search by UID or student name" class="form-input" />
      </div>

      <p class="sp-section-title">{{ filtered.length }} card{{ filtered.length === 1 ? '' : 's' }}</p>

      <div v-if="loading" class="center"><ion-spinner name="crescent" color="primary" /></div>

      <div v-else-if="filtered.length === 0" class="empty-state">
        <ion-icon :icon="wifiOutline" />
        <p>No cards found</p>
      </div>

      <div v-else class="cards-list">
        <div v-for="c in filtered" :key="c.id" class="card-row fade-up" :class="{ inactive: !c.active }">
          <div class="card-icon"><ion-icon :icon="wifiOutline" /></div>
          <div class="card-info">
            <p class="card-uid">{{ c.uid }}</p>
            <p class="card-meta">{{ c.name }} &middot; {{ c.class }} &middot; ₹{{ c.balance.toFixed(0) }}</p>
          </div>
          <span class="badge" :class="c.active ? 'active-badge' : 'inactive-badge'">{{ c.active ? 'Active' : 'Inactive' }}</span>
          <button class="action-btn" @click="toggle(c)">
            <ion-icon :icon="c.active ? banOutline : refreshOutline" />
          </button>
        </div>
      </div>

      <div style="height: 24px" />
    </ion-content>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent,
} from '@ionic/vue';
import { wifiOutline, banOutline, refreshOutline, logOutOutline } from 'ionicons/icons';
import api from '@/composables/useApi';
import { useAuthStore } from '@/store/auth';

interface Card {
  id: string; uid: string; active: number; student_id: string;
  name: string; class: string; email: string; balance: number;
}

const router = useRouter();
const auth   = useAuthStore();

const cards      = ref<Card[]>([]);
const loading    = ref(true);
const processing = ref(false);
const q          = ref('');

const filtered = computed(() => {
  if (!q.value.trim()) return cards.value;
  const needle = q.value.trim().toLowerCase();
  return cards.value.filter((c) => c.uid.toLowerCase().includes(needle) || c.name.toLowerCase().includes(needle));
});

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/nfc/cards');
    cards.value = data;
  } catch (err: any) {
    console.error('Failed to load cards:', err?.response?.data?.error || err.message);
  } finally {
    loading.value = false;
  }
}

async function toggle(c: Card) {
  processing.value = true;
  try { await api.patch(`/nfc/cards/${c.id}/toggle`); await load(); }
  catch (err: any) { console.error('Failed to toggle card:', err?.response?.data?.error || err.message); }
  finally { processing.value = false; }
}

async function refresh(event: any) { await load(); event.target.complete(); }

function logout() { auth.logout(); router.replace('/login'); }

onMounted(load);
</script>

<style scoped>
.processing-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
}
.filter-card { padding: 14px 16px; }
.form-input {
  width: 100%; padding: 12px 14px; border-radius: 12px;
  border: 2px solid var(--sp-border); background: var(--sp-bg);
  font-size: 14px; color: var(--sp-text); outline: none; box-sizing: border-box;
}
.form-input:focus { border-color: var(--sp-purple); }

.cards-list { padding: 4px 0; }
.card-row {
  display: flex; align-items: center; gap: 12px;
  background: white; border-radius: 16px;
  margin: 6px 14px; padding: 14px;
  box-shadow: var(--sp-shadow);
}
.card-row.inactive { opacity: 0.55; }
.card-icon {
  width: 42px; height: 42px; border-radius: 12px;
  background: var(--sp-purple-light); color: var(--sp-purple);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; flex-shrink: 0;
}
.card-info { flex: 1; min-width: 0; }
.card-uid { font-size: 14px; font-weight: 700; margin: 0; font-family: monospace; }
.card-meta { font-size: 12px; color: var(--sp-subtext); margin: 2px 0 0; }

.badge { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 100px; flex-shrink: 0; }
.badge.active-badge { background: var(--sp-teal-light); color: var(--sp-teal); }
.badge.inactive-badge { background: var(--sp-orange-light); color: var(--sp-orange); }

.action-btn {
  width: 36px; height: 36px; border-radius: 10px; border: none;
  background: var(--sp-bg); color: var(--sp-subtext);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; cursor: pointer; flex-shrink: 0;
}

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 48px 16px; gap: 10px; color: var(--sp-subtext); font-size: 14px; }
.empty-state ion-icon { font-size: 52px; opacity: 0.4; }
.center { display: flex; justify-content: center; padding: 32px; }
ion-content { --background: var(--sp-bg); }
</style>
