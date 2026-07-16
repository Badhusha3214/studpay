<template>
  <template>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Staff Accounts</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="logout">
            <ion-icon :icon="logOutOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="processing" class="processing-overlay">
        <ion-spinner name="crescent" color="light" />
      </div>

      <p class="sp-section-title">Create Staff Account</p>
      <div class="sp-card fade-up create-card">
        <div class="role-toggle">
          <button type="button" class="role-btn" :class="{ active: newRole === 'cashier' }" @click="newRole = 'cashier'">Cashier</button>
          <button type="button" class="role-btn" :class="{ active: newRole === 'shop_owner' }" @click="newRole = 'shop_owner'">Shop Owner</button>
          <button type="button" class="role-btn" :class="{ active: newRole === 'school_admin' }" @click="newRole = 'school_admin'">School Admin</button>
        </div>

        <div class="form-group">
          <label>Full Name</label>
          <input v-model="form.name" placeholder="e.g. Meera Iyer" class="form-input" />
        </div>
        <div class="form-group">
          <label>Email</label>
          <input v-model="form.email" type="email" placeholder="e.g. meera@studpay.school" class="form-input" />
        </div>
        <div v-if="newRole === 'shop_owner' || newRole === 'cashier'" class="form-group">
          <label>Shop</label>
          <select v-model="form.shopId" class="form-input form-select">
            <option value="">+ Create a new shop</option>
            <option v-for="s in shops" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div v-if="newRole === 'shop_owner' && !form.shopId" class="form-group">
          <label>New Shop Name</label>
          <input v-model="form.merchantName" placeholder="e.g. Sports Store" class="form-input" />
        </div>
        <div v-if="newRole === 'shop_owner'" class="form-group">
          <label>Contact Phone (optional)</label>
          <input v-model="form.phone" type="tel" placeholder="e.g. 9876543210" class="form-input" />
        </div>
        <div v-if="newRole === 'cashier'" class="form-group">
          <label>Contact Phone (optional)</label>
          <input v-model="form.phone" type="tel" placeholder="e.g. 9876543210" class="form-input" />
        </div>
        <div class="form-group">
          <label>PIN</label>
          <input v-model="form.pin" type="password" maxlength="6" placeholder="4-6 digit PIN" class="form-input" />
        </div>

        <ion-button expand="block" class="link-btn" :disabled="!canSubmit || createLoading" @click="createStaff">
          <ion-spinner v-if="createLoading" name="crescent" />
          <span v-else>Create Account</span>
        </ion-button>
        <p v-if="createMsg" class="form-msg" :class="createMsgClass">{{ createMsg }}</p>
      </div>

      <p class="sp-section-title">{{ staff.length }} staff account{{ staff.length === 1 ? '' : 's' }}</p>

      <div v-if="loading" class="center"><ion-spinner name="crescent" color="primary" /></div>

      <div v-else class="staff-list">
        <div v-for="s in staff" :key="s.id" class="staff-row fade-up" :class="{ inactive: !s.active }">
          <div class="staff-avatar">{{ initials(s.name) }}</div>
          <div class="staff-info">
            <p class="staff-name">{{ s.name }}</p>
            <p class="staff-meta">{{ s.email }}{{ s.merchant_name ? ` · ${s.merchant_name}` : '' }}</p>
          </div>
          <span class="badge" :class="s.role === 'school_admin' ? 'admin-badge' : s.role === 'cashier' ? 'cashier-badge' : 'shop-badge'">
            {{ s.role === 'school_admin' ? 'Admin' : s.role === 'cashier' ? 'Cashier' : 'Shop Owner' }}
          </span>
          <button v-if="s.role === 'shop_owner' || s.role === 'cashier'" class="action-btn" title="Edit" @click="editCashier(s)">
            <ion-icon :icon="createOutline" />
          </button>
          <button v-if="s.active" class="action-btn danger" title="Deactivate" @click="confirmDeactivate(s)">
            <ion-icon :icon="trashOutline" />
          </button>
          <button v-else class="action-btn" title="Reactivate" @click="reactivate(s)">
            <ion-icon :icon="refreshOutline" />
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
  IonIcon, IonSpinner, alertController,
} from '@ionic/vue';
import { trashOutline, refreshOutline, logOutOutline, createOutline } from 'ionicons/icons';
import api from '@/composables/useApi';
import { useAuthStore } from '@/store/auth';

interface Staff {
  id: string; name: string; email: string; merchant_name: string | null;
  phone: string | null; role: 'shop_owner' | 'school_admin' | 'cashier'; active: number;
}
interface Shop { id: string; name: string; }

const router = useRouter();
const auth   = useAuthStore();

const staff       = ref<Staff[]>([]);
const shops       = ref<Shop[]>([]);
const loading     = ref(true);
const processing  = ref(false);

const newRole = ref<'cashier' | 'shop_owner' | 'school_admin'>('cashier');
const form    = ref({ name: '', email: '', pin: '', merchantName: '', phone: '', shopId: '' });

const createLoading = ref(false);
const createMsg      = ref('');
const createMsgClass = ref('');

const canSubmit = computed(() => {
  if (!form.value.name || !form.value.email || !form.value.pin) return false;
  if (newRole.value === 'shop_owner' && !form.value.merchantName && !form.value.shopId) return false;
  if (newRole.value === 'cashier' && !form.value.shopId) return false;
  return true;
});

async function load() {
  loading.value = true;
  try {
    const [staffRes, shopsRes] = await Promise.all([api.get('/admin/staff'), api.get('/admin/shops')]);
    staff.value = staffRes.data;
    shops.value = shopsRes.data;
  } catch (err: any) {
    console.error('Failed to load staff:', err?.response?.data?.error || err.message);
  } finally {
    loading.value = false;
  }
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

async function createStaff() {
  createLoading.value = true;
  createMsg.value = '';
  try {
    let endpoint = '/admin/school-admins';
    const payload: any = { name: form.value.name, email: form.value.email, pin: form.value.pin };
    if (newRole.value === 'cashier') {
      endpoint = '/admin/cashiers';
      payload.shopId = form.value.shopId;
      payload.phone = form.value.phone || undefined;
    } else if (newRole.value === 'shop_owner') {
      endpoint = '/admin/shop-owners';
      if (form.value.shopId) payload.shopId = form.value.shopId;
      else payload.merchantName = form.value.merchantName;
      payload.phone = form.value.phone || undefined;
    }
    await api.post(endpoint, payload);
    createMsg.value      = 'Account created!';
    createMsgClass.value = 'success';
    form.value = { name: '', email: '', pin: '', merchantName: '', phone: '', shopId: '' };
    await load();
  } catch (e: any) {
    createMsg.value      = e?.response?.data?.error || 'Failed to create account';
    createMsgClass.value = 'error';
  } finally {
    createLoading.value = false;
  }
}

async function editCashier(s: Staff) {
  const currentShop = shops.value.find((shop) => shop.name === s.merchant_name);
  const alert = await alertController.create({
    header: `Edit ${s.name}`,
    inputs: [
      { name: 'phone', type: 'tel', value: s.phone || '', placeholder: 'Contact phone' },
      ...shops.value.map((shop) => ({
        name: 'shopId', type: 'radio' as const, label: shop.name, value: shop.id,
        checked: shop.id === currentShop?.id,
      })),
    ],
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Save', handler: async (vals) => {
          processing.value = true;
          try {
            await api.patch(`/admin/shop-owners/${s.id}`, {
              shopId: vals.shopId || undefined,
              phone: vals.phone === '' ? null : vals.phone,
            });
            await load();
          } catch (err: any) {
            console.error('Failed to update cashier:', err?.response?.data?.error || err.message);
          } finally {
            processing.value = false;
          }
        },
      },
    ],
  });
  await alert.present();
}

async function confirmDeactivate(s: Staff) {
  const alert = await alertController.create({
    header: 'Deactivate Account',
    message: `Deactivate ${s.name}'s account? They won't be able to log in until reactivated.`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Deactivate', role: 'destructive',
        handler: async () => {
          processing.value = true;
          try { await api.delete(`/students/${s.id}`); await load(); }
          catch (err: any) { console.error('Failed to deactivate:', err?.response?.data?.error || err.message); }
          finally { processing.value = false; }
        },
      },
    ],
  });
  await alert.present();
}

async function reactivate(s: Staff) {
  processing.value = true;
  try { await api.patch(`/admin/students/${s.id}/reactivate`); await load(); }
  catch (err: any) { console.error('Failed to reactivate:', err?.response?.data?.error || err.message); }
  finally { processing.value = false; }
}

function logout() { auth.logout(); router.replace('/login'); }

onMounted(load);
</script>

<style scoped>
.processing-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
}
.create-card { padding: 16px; }
.role-toggle {
  display: flex; gap: 8px; background: var(--sp-bg);
  border-radius: 12px; padding: 4px; margin-bottom: 16px;
}
.role-btn {
  flex: 1; border: none; background: transparent; cursor: pointer;
  padding: 10px 0; border-radius: 9px; font-size: 14px; font-weight: 700;
  color: var(--sp-subtext);
}
.role-btn.active { background: var(--sp-purple); color: white; }

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

.staff-list { padding: 4px 0; }
.staff-row {
  display: flex; align-items: center; gap: 12px;
  background: white; border-radius: 16px;
  margin: 6px 14px; padding: 14px;
  box-shadow: var(--sp-shadow);
}
.staff-row.inactive { opacity: 0.55; }
.staff-avatar {
  width: 42px; height: 42px; border-radius: 12px;
  background: var(--sp-purple-light); color: var(--sp-purple);
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 700; flex-shrink: 0;
}
.staff-info { flex: 1; min-width: 0; }
.staff-name { font-size: 14px; font-weight: 700; margin: 0; }
.staff-meta { font-size: 12px; color: var(--sp-subtext); margin: 2px 0 0; }

.badge { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 100px; flex-shrink: 0; }
.badge.shop-badge   { background: var(--sp-teal-light); color: var(--sp-teal); }
.badge.admin-badge  { background: var(--sp-purple-light); color: var(--sp-purple); }
.badge.cashier-badge { background: #FFF3E0; color: #E65100; }

.action-btn {
  width: 36px; height: 36px; border-radius: 10px; border: none;
  background: var(--sp-bg); color: var(--sp-subtext);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; cursor: pointer; flex-shrink: 0;
}
.action-btn.danger { color: var(--sp-orange); }

.center { display: flex; justify-content: center; padding: 32px; }
ion-content { --background: var(--sp-bg); }
</style>
