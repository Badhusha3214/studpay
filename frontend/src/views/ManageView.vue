<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>My Children</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-refresher slot="fixed" @ionRefresh="refresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div v-if="loading" class="center">
        <ion-spinner name="crescent" color="primary" />
      </div>

      <template v-else>
        <div v-if="auth.children.length === 0" class="empty-state">
          <ion-icon :icon="peopleOutline" />
          <p>No children linked yet</p>
        </div>

        <div v-else class="children-list">
          <div v-for="c in auth.children" :key="c.id" class="child-card fade-up">
            <div class="child-avatar">{{ initials(c.name) }}</div>
            <div class="child-info">
              <p class="child-name">{{ c.name }}</p>
              <p class="child-meta">{{ c.class }} · {{ c.email }}</p>
              <div class="child-badges">
                <span v-if="c.card_uid" class="badge nfc">
                  <ion-icon :icon="wifiOutline" /> {{ c.card_uid }}
                  <ion-icon :icon="closeCircleOutline" class="badge-x" @click.stop="deactivateCard(c)" />
                </span>
                <span v-else class="badge no-card">No card</span>
              </div>
            </div>
            <button class="edit-btn" @click="openEdit(c)">
              <ion-icon :icon="createOutline" />
            </button>
            <button class="remove-btn" @click="confirmArchive(c)">
              <ion-icon :icon="trashOutline" />
            </button>
          </div>
        </div>

        <ion-button expand="block" class="add-child-btn" @click="openAdd">
          <ion-icon :icon="personAddOutline" slot="start" />
          Add Child
        </ion-button>

        <!-- Register NFC card -->
        <p class="sp-section-title">Register NFC Card</p>
        <div class="sp-card fade-up">
          <div class="scan-tile" :class="{ scanning: nfcScanning }" @click="scanNewCard">
            <div class="scan-tile-icon">
              <ion-icon :icon="wifiOutline" />
            </div>
            <div>
              <p class="scan-tile-title">{{ nfcScanning ? 'Hold card near phone...' : 'Scan NFC Tag' }}</p>
              <p class="scan-tile-sub">Tap to scan automatically</p>
            </div>
            <ion-spinner v-if="nfcScanning" name="crescent" />
          </div>

          <div class="divider"><span>or type manually</span></div>

          <div class="form-group">
            <label>Card UID</label>
            <input v-model="newUid" placeholder="e.g. A1B2C3D4" class="form-input" />
          </div>

          <div class="form-group">
            <label>Child</label>
            <select v-model="newStudentId" class="form-input form-select">
              <option value="" disabled>Select a child</option>
              <option v-for="c in auth.children" :key="c.id" :value="c.id">
                {{ c.name }}{{ c.card_uid ? ' (has a card)' : '' }}
              </option>
            </select>
          </div>

          <ion-button
            expand="block" class="link-btn"
            :disabled="!newUid || !newStudentId || registerLoading"
            @click="registerCard"
          >
            <ion-spinner v-if="registerLoading" name="crescent" />
            <span v-else>Link Tag to Child</span>
          </ion-button>
          <p v-if="registerMsg" class="form-msg" :class="registerMsgClass">{{ registerMsg }}</p>
        </div>
      </template>

      <div style="height: 24px" />
    </ion-content>

    <!-- Add Child modal -->
    <ion-modal :is-open="showAdd" @didDismiss="closeAdd">
      <ion-page>
        <ion-header>
          <ion-toolbar>
            <ion-title>Add Child</ion-title>
            <ion-buttons slot="end"><ion-button @click="closeAdd">Close</ion-button></ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <div class="form-group">
            <label>Full Name</label>
            <input v-model="addForm.name" placeholder="e.g. Priya Nair" class="form-input" />
            <p class="form-hint">Last name must match yours ({{ surnameHint }}) to link this account to you</p>
          </div>
          <div class="form-group">
            <label>Class / Grade</label>
            <input v-model="addForm.cls" placeholder="e.g. 8-A" class="form-input" />
          </div>
          <div class="form-group">
            <label>Initial PIN (4 digits)</label>
            <input v-model="addForm.pin" type="password" maxlength="4" placeholder="Set a PIN" class="form-input" />
          </div>
          <div class="form-group">
            <label>Starting Balance (₹)</label>
            <input v-model="addForm.balance" type="number" placeholder="0" class="form-input" />
          </div>
          <ion-button
            expand="block" class="link-btn"
            :disabled="!addForm.name || !addForm.cls || !addForm.pin || addLoading"
            @click="submitAdd"
          >
            <ion-spinner v-if="addLoading" name="crescent" />
            <span v-else>Create Child Account</span>
          </ion-button>
          <p v-if="addMsg" class="form-msg" :class="addMsgClass">{{ addMsg }}</p>
        </ion-content>
      </ion-page>
    </ion-modal>

    <!-- Edit Child modal -->
    <ion-modal :is-open="showEdit" @didDismiss="showEdit = false">
      <ion-page>
        <ion-header>
          <ion-toolbar>
            <ion-title>Edit Child</ion-title>
            <ion-buttons slot="end"><ion-button @click="showEdit = false">Close</ion-button></ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <div class="form-group">
            <label>Full Name</label>
            <input v-model="editForm.name" class="form-input" />
            <p class="form-hint">Last name must stay {{ surnameHint }} to keep this account linked to you</p>
          </div>
          <div class="form-group">
            <label>Class / Grade</label>
            <input v-model="editForm.cls" class="form-input" />
          </div>
          <ion-button
            expand="block" class="link-btn"
            :disabled="!editForm.name || !editForm.cls || editLoading"
            @click="submitEdit"
          >
            <ion-spinner v-if="editLoading" name="crescent" />
            <span v-else>Save Changes</span>
          </ion-button>
          <p v-if="editMsg" class="form-msg" :class="editMsgClass">{{ editMsg }}</p>
        </ion-content>
      </ion-page>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent, IonModal, alertController,
} from '@ionic/vue';
import {
  peopleOutline, wifiOutline, createOutline, personAddOutline, trashOutline, closeCircleOutline,
} from 'ionicons/icons';
import api from '@/composables/useApi';
import { useNfc } from '@/composables/useNfc';
import { useAuthStore } from '@/store/auth';

const auth = useAuthStore();
const { scanning: nfcScanning, startScan, error: nfcError } = useNfc();

const loading = ref(false);

const surnameHint = computed(() => auth.student?.name.trim().split(/\s+/).slice(-1)[0] ?? '');

async function load() {
  loading.value = true;
  try { await auth.loadChildren(); }
  finally { loading.value = false; }
}

async function refresh(event: any) { await load(); event.target.complete(); }

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

// Add child
const showAdd     = ref(false);
const addLoading  = ref(false);
const addMsg      = ref('');
const addMsgClass = ref('');
const addForm     = ref({ name: '', cls: '', pin: '', balance: '' });

function openAdd() { showAdd.value = true; }
function closeAdd() {
  showAdd.value = false;
  addForm.value = { name: '', cls: '', pin: '', balance: '' };
  addMsg.value  = '';
}

async function submitAdd() {
  addLoading.value = true; addMsg.value = '';
  try {
    await api.post('/parent/students', {
      name: addForm.value.name,
      class: addForm.value.cls,
      pin: addForm.value.pin,
      balance: Number(addForm.value.balance) || 0,
    });
    addMsg.value      = 'Child account created!';
    addMsgClass.value = 'success';
    await auth.loadChildren();
    setTimeout(closeAdd, 1200);
  } catch (e: any) {
    addMsg.value      = e?.response?.data?.error || 'Failed to create child account';
    addMsgClass.value = 'error';
  } finally {
    addLoading.value = false;
  }
}

// Edit child
const showEdit     = ref(false);
const editLoading  = ref(false);
const editMsg      = ref('');
const editMsgClass = ref('');
const editForm     = ref({ id: '', name: '', cls: '' });

function openEdit(c: any) {
  editForm.value = { id: c.id, name: c.name, cls: c.class };
  editMsg.value  = '';
  showEdit.value = true;
}

async function submitEdit() {
  editLoading.value = true; editMsg.value = '';
  try {
    await api.put(`/parent/child/${editForm.value.id}`, {
      name: editForm.value.name,
      class: editForm.value.cls,
    });
    editMsg.value      = 'Saved!';
    editMsgClass.value = 'success';
    await auth.loadChildren();
    setTimeout(() => { showEdit.value = false; }, 1000);
  } catch (e: any) {
    editMsg.value      = e?.response?.data?.error || 'Failed to save changes';
    editMsgClass.value = 'error';
  } finally {
    editLoading.value = false;
  }
}

async function confirmArchive(c: any) {
  const alert = await alertController.create({
    header: 'Remove Child',
    message: `Remove ${c.name} from your account? This can't be undone from the app.`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Remove', role: 'destructive',
        handler: async () => {
          await api.patch(`/parent/child/${c.id}/archive`);
          await auth.loadChildren();
        },
      },
    ],
  });
  await alert.present();
}

async function deactivateCard(c: any) {
  const alert = await alertController.create({
    header: 'Remove Card',
    message: `Deactivate card ${c.card_uid} for ${c.name}?`,
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Remove', role: 'destructive',
        handler: async () => {
          await api.patch(`/parent/nfc/${c.card_id}/deactivate`);
          await auth.loadChildren();
        },
      },
    ],
  });
  await alert.present();
}

// Register NFC card
const newUid           = ref('');
const newStudentId     = ref('');
const registerLoading  = ref(false);
const registerMsg      = ref('');
const registerMsgClass = ref('');

async function scanNewCard() {
  registerMsg.value = '';
  try {
    newUid.value = await startScan();
  } catch {
    registerMsg.value      = nfcError.value || 'Scan failed';
    registerMsgClass.value = 'error';
  }
}

async function registerCard() {
  registerLoading.value = true;
  registerMsg.value     = '';
  try {
    await api.post('/parent/nfc/register', { uid: newUid.value, studentId: newStudentId.value });
    registerMsg.value      = `Tag ${newUid.value} linked!`;
    registerMsgClass.value = 'success';
    newUid.value = newStudentId.value = '';
    await auth.loadChildren();
  } catch (e: any) {
    registerMsg.value      = e?.response?.data?.error || 'Failed to link tag';
    registerMsgClass.value = 'error';
  } finally {
    registerLoading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.children-list { padding: 4px 0; }
.child-card {
  display: flex; align-items: center; gap: 12px;
  background: white; border-radius: 16px;
  margin: 6px 14px; padding: 14px;
  box-shadow: var(--sp-shadow);
}
.child-avatar {
  width: 46px; height: 46px; border-radius: 14px;
  background: var(--sp-purple-light); color: var(--sp-purple);
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; font-weight: 700; flex-shrink: 0;
}
.child-info { flex: 1; min-width: 0; }
.child-name { font-size: 15px; font-weight: 700; margin: 0; }
.child-meta { font-size: 12px; color: var(--sp-subtext); margin: 2px 0 4px; }
.child-badges { display: flex; gap: 6px; flex-wrap: wrap; }
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 100px;
}
.badge.nfc     { background: var(--sp-purple-light); color: var(--sp-purple); font-family: monospace; }
.badge.no-card { background: var(--sp-border); color: var(--sp-subtext); }
.badge-x { font-size: 13px; cursor: pointer; margin-left: 2px; }
.edit-btn, .remove-btn {
  width: 36px; height: 36px; border-radius: 10px; border: none;
  background: var(--sp-bg); color: var(--sp-subtext);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; cursor: pointer; flex-shrink: 0;
}
.remove-btn { color: var(--sp-orange); margin-left: 6px; }

.add-child-btn { --background: var(--sp-purple); --border-radius: 14px; height: 50px; font-weight: 700; margin: 12px 14px; width: calc(100% - 28px); }

.sp-section-title { margin-top: 8px; }

.scan-tile {
  display: flex; align-items: center; gap: 14px;
  background: var(--sp-purple-light); border-radius: 16px;
  padding: 16px; margin-bottom: 20px; cursor: pointer;
  border: 2px solid transparent; transition: border-color 0.2s;
}
.scan-tile.scanning { border-color: var(--sp-purple); }
.scan-tile-icon {
  width: 52px; height: 52px; border-radius: 50%;
  background: var(--sp-purple);
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; color: white; flex-shrink: 0;
}
.scan-tile-title { font-size: 15px; font-weight: 700; margin: 0; color: var(--sp-text); }
.scan-tile-sub   { font-size: 12px; color: var(--sp-subtext); margin: 3px 0 0; }

.divider {
  display: flex; align-items: center; gap: 10px;
  color: var(--sp-subtext); font-size: 12px; margin: 0 0 18px;
}
.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--sp-border); }

.form-group { margin-bottom: 16px; }
.form-group label {
  display: block; font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .05em;
  color: var(--sp-subtext); margin-bottom: 7px;
}
.form-input {
  width: 100%; padding: 13px 14px; border-radius: 12px;
  border: 2px solid var(--sp-border); background: var(--sp-bg);
  font-size: 15px; color: var(--sp-text); outline: none;
  box-sizing: border-box; transition: border-color 0.2s;
}
.form-input:focus { border-color: var(--sp-purple); }
.form-select {
  appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3e%3cpath d='M6 9l6 6 6-6'/%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 14px center;
  background-size: 16px;
  padding-right: 40px;
  cursor: pointer;
}
.form-hint { font-size: 11px; color: var(--sp-subtext); margin: 6px 0 0; }
.link-btn  { --background: var(--sp-purple); --border-radius: 14px; height: 52px; font-weight: 700; margin-top: 8px; }
.form-msg  { font-size: 13px; font-weight: 600; text-align: center; margin-top: 12px; }
.form-msg.success { color: var(--sp-teal); }
.form-msg.error   { color: var(--sp-orange); }

.empty-state { display: flex; flex-direction: column; align-items: center; padding: 48px 16px; gap: 10px; color: var(--sp-subtext); font-size: 14px; }
.empty-state ion-icon { font-size: 52px; opacity: 0.4; }
.center { display: flex; justify-content: center; padding: 32px; }
</style>
