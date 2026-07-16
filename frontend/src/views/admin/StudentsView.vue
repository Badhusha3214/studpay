<template>
  <template>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Students</ion-title>
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

      <!-- Filters -->
      <div class="sp-card fade-up filter-card">
        <input v-model="q" placeholder="Search name or email" class="form-input" @input="debouncedLoad" />
        <div class="filter-row">
          <select v-model="cls" class="form-input form-select" @change="load">
            <option value="">All classes</option>
            <option v-for="c in classOptions" :key="c" :value="c">{{ c }}</option>
          </select>
          <select v-model="active" class="form-input form-select" @change="load">
            <option value="1">Active only</option>
            <option value="all">Include inactive</option>
          </select>
        </div>
      </div>

      <ion-button expand="block" class="link-btn" @click="router.push('/admin/students/bulk-import')">
        <ion-icon :icon="cloudUploadOutline" slot="start" />
        Bulk Import Students
      </ion-button>

      <ion-button expand="block" fill="outline" class="link-btn outline-btn" @click="showAddForm = !showAddForm">
        <ion-icon :icon="personAddOutline" slot="start" />
        {{ showAddForm ? 'Close' : 'Add Student' }}
      </ion-button>

      <div v-if="showAddForm" class="sp-card fade-up create-card">
        <div class="form-group"><label>Full Name</label><input v-model="addForm.name" class="form-input" placeholder="e.g. Arjun Menon" /></div>
        <div class="form-group"><label>Email</label><input v-model="addForm.email" type="email" class="form-input" placeholder="e.g. arjun@student.school" /></div>
        <div class="filter-row">
          <div class="form-group"><label>Class / Grade</label><input v-model="addForm.class" class="form-input" placeholder="e.g. 10-A" /></div>
          <div class="form-group"><label>PIN</label><input v-model="addForm.pin" type="password" maxlength="6" class="form-input" placeholder="4-6 digits" /></div>
        </div>
        <div class="form-group"><label>Starting Balance</label><input v-model="addForm.balance" type="number" class="form-input" placeholder="0" /></div>
        <div class="filter-row">
          <div class="form-group"><label>Daily Spend Limit</label><input v-model="addForm.dailyLimitAmount" type="number" class="form-input" placeholder="Optional" /></div>
          <div class="form-group"><label>Daily Txn Limit</label><input v-model="addForm.dailyLimitCount" type="number" class="form-input" placeholder="Optional" /></div>
        </div>
        <div class="form-group"><label>Allergies</label><input v-model="addForm.allergies" class="form-input" placeholder="Optional" /></div>
        <div class="form-group"><label>Guardian Phone</label><input v-model="addForm.phone" class="form-input" placeholder="Optional" /></div>
        <ion-button expand="block" class="link-btn" :disabled="!canAdd || addLoading" @click="addStudent">
          <ion-spinner v-if="addLoading" name="crescent" />
          <span v-else>Create Student</span>
        </ion-button>
        <p v-if="addMsg" class="form-msg" :class="addMsgClass">{{ addMsg }}</p>
      </div>

      <p class="sp-section-title">{{ students.length }} student{{ students.length === 1 ? '' : 's' }}</p>

      <div v-if="loading" class="center"><ion-spinner name="crescent" color="primary" /></div>

      <div v-else-if="students.length === 0" class="empty-state">
        <ion-icon :icon="peopleOutline" />
        <p>No students found</p>
      </div>

      <div v-else class="students-list">
        <div v-for="s in students" :key="s.id" class="student-card fade-up" :class="{ inactive: !s.active }">
          <div class="student-avatar">{{ initials(s.name) }}</div>
          <div class="student-info">
            <p class="student-name">{{ s.name }}</p>
            <p class="student-meta">{{ s.class }} &middot; {{ s.email }} &middot; ₹{{ s.balance.toFixed(0) }}</p>
            <div class="student-badges">
              <span v-if="s.card_uid" class="badge nfc"><ion-icon :icon="wifiOutline" /> {{ s.card_uid }}</span>
              <span v-else class="badge no-card">No card</span>
              <span v-if="!s.active" class="badge inactive-badge">Inactive</span>
            </div>
          </div>
          <div class="student-actions">
            <button class="action-btn" title="Edit" @click="editStudent(s)">
              <ion-icon :icon="createOutline" />
            </button>
            <button class="action-btn" title="Reset PIN" @click="resetPin(s)">
              <ion-icon :icon="keyOutline" />
            </button>
            <button v-if="s.active" class="action-btn danger" title="Deactivate" @click="confirmDeactivate(s)">
              <ion-icon :icon="trashOutline" />
            </button>
            <button v-else class="action-btn" title="Reactivate" @click="reactivate(s)">
              <ion-icon :icon="refreshOutline" />
            </button>
          </div>
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
import {
  peopleOutline, wifiOutline, keyOutline, trashOutline, refreshOutline,
  cloudUploadOutline, logOutOutline, personAddOutline, createOutline,
} from 'ionicons/icons';
import api from '@/composables/useApi';
import { useAuthStore } from '@/store/auth';

interface Student {
  id: string; name: string; email: string; class: string; balance: number;
  active: number; card_uid: string | null;
}

const router = useRouter();
const auth   = useAuthStore();

const students   = ref<Student[]>([]);
const loading    = ref(true);
const processing = ref(false);

const q      = ref('');
const cls    = ref('');
const active = ref('1');

const showAddForm  = ref(false);
const addLoading   = ref(false);
const addMsg       = ref('');
const addMsgClass  = ref('');
const addForm = ref({
  name: '', email: '', class: '', pin: '', balance: '',
  dailyLimitAmount: '', dailyLimitCount: '', allergies: '', phone: '',
});

const canAdd = computed(() => !!(addForm.value.name && addForm.value.email && addForm.value.class && addForm.value.pin));

const classOptions = computed(() => [...new Set(students.value.map((s) => s.class))].sort());

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedLoad() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(load, 300);
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/students', { params: { q: q.value || undefined, class: cls.value || undefined, active: active.value } });
    students.value = data;
  } catch (err: any) {
    console.error('Failed to load students:', err?.response?.data?.error || err.message);
  } finally {
    loading.value = false;
  }
}

async function addStudent() {
  addLoading.value = true;
  addMsg.value = '';
  try {
    await api.post('/admin/students', {
      name: addForm.value.name, email: addForm.value.email, class: addForm.value.class,
      pin: addForm.value.pin, balance: addForm.value.balance || undefined,
      dailyLimitAmount: addForm.value.dailyLimitAmount || undefined,
      dailyLimitCount: addForm.value.dailyLimitCount || undefined,
      allergies: addForm.value.allergies || undefined, phone: addForm.value.phone || undefined,
    });
    addMsg.value      = 'Student created!';
    addMsgClass.value = 'success';
    addForm.value = { name: '', email: '', class: '', pin: '', balance: '', dailyLimitAmount: '', dailyLimitCount: '', allergies: '', phone: '' };
    await load();
  } catch (e: any) {
    addMsg.value      = e?.response?.data?.error || 'Failed to create student';
    addMsgClass.value = 'error';
  } finally {
    addLoading.value = false;
  }
}

async function editStudent(s: Student) {
  const { data: full } = await api.get(`/students/${s.id}`);
  const alert = await alertController.create({
    header: `Edit ${s.name}`,
    inputs: [
      { name: 'class', type: 'text', value: full.class, placeholder: 'Class / grade' },
      { name: 'dailyLimitAmount', type: 'number', value: full.daily_limit_amount ?? '', placeholder: 'Daily spend limit' },
      { name: 'dailyLimitCount', type: 'number', value: full.daily_limit_count ?? '', placeholder: 'Daily transaction limit' },
      { name: 'allergies', type: 'text', value: full.allergies ?? '', placeholder: 'Allergies' },
      { name: 'phone', type: 'tel', value: full.phone ?? '', placeholder: 'Guardian phone' },
    ],
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Save', handler: async (vals) => {
          processing.value = true;
          try {
            await api.patch(`/admin/students/${s.id}`, {
              class: vals.class || undefined,
              dailyLimitAmount: vals.dailyLimitAmount === '' ? null : vals.dailyLimitAmount,
              dailyLimitCount: vals.dailyLimitCount === '' ? null : vals.dailyLimitCount,
              allergies: vals.allergies === '' ? null : vals.allergies,
              phone: vals.phone === '' ? null : vals.phone,
            });
            await load();
          } catch (err: any) {
            console.error('Failed to update student:', err?.response?.data?.error || err.message);
          } finally {
            processing.value = false;
          }
        },
      },
    ],
  });
  await alert.present();
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

async function resetPin(s: Student) {
  const alert = await alertController.create({
    header: 'Reset PIN',
    message: `Generate a new PIN for ${s.name}?`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Reset', handler: async () => {
          processing.value = true;
          try {
            const { data } = await api.post(`/admin/students/${s.id}/reset-pin`);
            const result = await alertController.create({
              header: 'New PIN',
              message: `${s.name}'s new PIN is <strong>${data.pin}</strong>. Share it with them securely — it won't be shown again.`,
              buttons: ['OK'],
            });
            await result.present();
          } catch (err: any) {
            console.error('Failed to reset PIN:', err?.response?.data?.error || err.message);
          } finally {
            processing.value = false;
          }
        },
      },
    ],
  });
  await alert.present();
}

async function confirmDeactivate(s: Student) {
  const alert = await alertController.create({
    header: 'Deactivate Student',
    message: `Deactivate ${s.name}'s account and card? This can be undone from here.`,
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

async function reactivate(s: Student) {
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
.filter-card { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.filter-row { display: flex; gap: 8px; }
.filter-row .form-input { flex: 1; }
.filter-row .form-group { flex: 1; }

.form-input {
  width: 100%; padding: 12px 14px; border-radius: 12px;
  border: 2px solid var(--sp-border); background: var(--sp-bg);
  font-size: 14px; color: var(--sp-text); outline: none;
  box-sizing: border-box; transition: border-color 0.2s;
}
.form-input:focus { border-color: var(--sp-purple); }
.form-select {
  appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3e%3cpath d='M6 9l6 6 6-6'/%3e%3c/svg%3e");
  background-repeat: no-repeat; background-position: right 12px center; background-size: 16px;
  padding-right: 36px; cursor: pointer;
}

.link-btn { --background: var(--sp-purple); --border-radius: 14px; height: 48px; font-weight: 700; margin: 4px 14px 0; width: calc(100% - 28px); }
.outline-btn { --border-radius: 14px; --border-color: var(--sp-purple); --color: var(--sp-purple); margin-top: 8px; }

.create-card { padding: 16px; }
.form-group { margin-bottom: 14px; }
.form-group label {
  display: block; font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--sp-subtext); margin-bottom: 6px;
}
.form-msg { font-size: 13px; font-weight: 600; text-align: center; margin-top: 10px; }
.form-msg.success { color: var(--sp-teal); }
.form-msg.error   { color: var(--sp-orange); }

.students-list { padding: 4px 0; }
.student-card {
  display: flex; align-items: center; gap: 12px;
  background: white; border-radius: 16px;
  margin: 6px 14px; padding: 14px;
  box-shadow: var(--sp-shadow);
}
.student-card.inactive { opacity: 0.55; }
.student-avatar {
  width: 46px; height: 46px; border-radius: 14px;
  background: var(--sp-purple-light); color: var(--sp-purple);
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; font-weight: 700; flex-shrink: 0;
}
.student-info { flex: 1; min-width: 0; }
.student-name { font-size: 15px; font-weight: 700; margin: 0; }
.student-meta { font-size: 12px; color: var(--sp-subtext); margin: 2px 0 4px; }
.student-badges { display: flex; gap: 6px; flex-wrap: wrap; }
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 100px;
}
.badge.nfc     { background: var(--sp-purple-light); color: var(--sp-purple); font-family: monospace; }
.badge.no-card { background: var(--sp-border); color: var(--sp-subtext); }
.badge.inactive-badge { background: var(--sp-orange-light); color: var(--sp-orange); }

.student-actions { display: flex; gap: 6px; flex-shrink: 0; }
.action-btn {
  width: 36px; height: 36px; border-radius: 10px; border: none;
  background: var(--sp-bg); color: var(--sp-subtext);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; cursor: pointer; flex-shrink: 0;
}
.action-btn.danger { color: var(--sp-orange); }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 48px 16px; gap: 10px; color: var(--sp-subtext); font-size: 14px; }
.empty-state ion-icon { font-size: 52px; opacity: 0.4; }
.center { display: flex; justify-content: center; padding: 32px; }
ion-content { --background: var(--sp-bg); }
</style>
