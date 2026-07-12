<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="router.push('/admin/students')">
            <ion-icon :icon="arrowBackOutline" slot="icon-only" />
          </ion-button>
        </ion-buttons>
        <ion-title>Bulk Import Students</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="role-toggle">
        <button type="button" class="role-btn" :class="{ active: mode === 'file' }" @click="mode = 'file'">File</button>
        <button type="button" class="role-btn" :class="{ active: mode === 'paste' }" @click="mode = 'paste'">Paste</button>
        <button type="button" class="role-btn" :class="{ active: mode === 'manual' }" @click="mode = 'manual'">Manual</button>
      </div>

      <p class="csv-hint">
        Columns: <code>name, email, class, pin, balance</code> (balance optional). A header row is optional.
        Note: quoted fields with embedded commas (e.g. "Doe, Jr.") aren't supported by File/Paste — use Manual for those rows.
      </p>

      <!-- File mode -->
      <div v-if="mode === 'file'" class="sp-card fade-up">
        <input type="file" accept=".csv,.txt" @change="onFileChange" />
      </div>

      <!-- Paste mode -->
      <div v-if="mode === 'paste'" class="sp-card fade-up">
        <textarea
          v-model="pasteText" rows="6" class="form-input paste-area"
          placeholder="name,email,class,pin,balance&#10;Arjun Menon,arjun@student.school,10-A,5678,500"
        />
        <ion-button expand="block" class="link-btn" @click="parsePaste">Parse Rows</ion-button>
      </div>

      <!-- Manual mode -->
      <div v-if="mode === 'manual'" class="sp-card fade-up">
        <ion-button expand="block" class="link-btn" @click="addRow">
          <ion-icon :icon="addOutline" slot="start" /> Add Row
        </ion-button>
      </div>

      <!-- Shared editable preview -->
      <template v-if="rows.length">
        <p class="sp-section-title">{{ rows.length }} row{{ rows.length === 1 ? '' : 's' }} to import</p>
        <div class="preview-table">
          <div v-for="(row, i) in rows" :key="i" class="preview-row fade-up">
            <input v-model="row.name" placeholder="Name" class="cell" />
            <input v-model="row.email" placeholder="Email" class="cell" />
            <input v-model="row.class" placeholder="Class" class="cell cell-sm" />
            <input v-model="row.pin" placeholder="PIN" maxlength="6" class="cell cell-sm" />
            <input v-model="row.balance" placeholder="0" type="number" class="cell cell-sm" />
            <button class="remove-row-btn" @click="rows.splice(i, 1)">
              <ion-icon :icon="closeCircleOutline" />
            </button>
          </div>
        </div>

        <ion-button expand="block" class="link-btn submit-btn" :disabled="submitting" @click="submit">
          <ion-spinner v-if="submitting" name="crescent" />
          <span v-else>Import {{ rows.length }} Student{{ rows.length === 1 ? '' : 's' }}</span>
        </ion-button>
      </template>

      <!-- Results -->
      <template v-if="results">
        <div class="sp-card fade-up result-summary">
          <p class="result-line success">{{ results.summary.succeeded }} succeeded</p>
          <p v-if="results.summary.failed" class="result-line error">{{ results.summary.failed }} failed</p>
        </div>
        <div v-for="r in results.results.filter(x => x.status === 'error')" :key="r.row" class="sp-card fade-up error-row">
          <ion-icon :icon="closeCircleOutline" class="error-icon" />
          <div>
            <p class="error-row-title">Row {{ r.row }}{{ r.email ? ` (${r.email})` : '' }}</p>
            <p class="error-row-msg">{{ r.error }}</p>
          </div>
        </div>
        <ion-button expand="block" class="link-btn" @click="router.push('/admin/students')">Back to Students</ion-button>
      </template>

      <div style="height: 24px" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonIcon, IonSpinner,
} from '@ionic/vue';
import { arrowBackOutline, addOutline, closeCircleOutline } from 'ionicons/icons';
import api from '@/composables/useApi';
import { parseCsvText, type BulkStudentRow } from '@/utils/csv';

interface RowResult { row: number; status: 'success' | 'error'; email: string | null; error?: string; id?: string }
interface BulkResponse { summary: { total: number; succeeded: number; failed: number }; results: RowResult[] }

const router = useRouter();

const mode      = ref<'file' | 'paste' | 'manual'>('paste');
const pasteText = ref('');
const rows      = ref<BulkStudentRow[]>([]);
const submitting = ref(false);
const results     = ref<BulkResponse | null>(null);

function parsePaste() {
  rows.value = parseCsvText(pasteText.value);
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { rows.value = parseCsvText(String(reader.result || '')); };
  reader.readAsText(file);
}

function addRow() {
  rows.value.push({ name: '', email: '', class: '', pin: '', balance: '' });
}

async function submit() {
  submitting.value = true;
  results.value = null;
  try {
    const { data } = await api.post('/admin/students/bulk', {
      students: rows.value.map((r) => ({
        name: r.name, email: r.email, class: r.class, pin: r.pin,
        balance: r.balance === '' || r.balance === undefined ? undefined : Number(r.balance),
      })),
    });
    results.value = data;
    rows.value = [];
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.role-toggle {
  display: flex; gap: 8px; background: var(--sp-bg);
  border-radius: 12px; padding: 4px; margin: 16px;
}
.role-btn {
  flex: 1; border: none; background: transparent; cursor: pointer;
  padding: 10px 0; border-radius: 9px; font-size: 14px; font-weight: 700;
  color: var(--sp-subtext);
}
.role-btn.active { background: var(--sp-purple); color: white; }

.csv-hint { font-size: 12px; color: var(--sp-subtext); padding: 0 16px 8px; }
.csv-hint code { background: var(--sp-bg); padding: 1px 5px; border-radius: 4px; }

.form-input {
  width: 100%; padding: 12px 14px; border-radius: 12px;
  border: 2px solid var(--sp-border); background: var(--sp-bg);
  font-size: 14px; color: var(--sp-text); outline: none;
  box-sizing: border-box; font-family: monospace;
}
.paste-area { resize: vertical; }

.link-btn { --background: var(--sp-purple); --border-radius: 14px; height: 48px; font-weight: 700; margin-top: 10px; }
.submit-btn { margin: 12px 16px; width: calc(100% - 32px); }

.preview-table { padding: 0 10px; }
.preview-row { display: flex; gap: 6px; align-items: center; padding: 6px 0; }
.cell {
  flex: 2; min-width: 0; padding: 8px 10px; border-radius: 8px;
  border: 1px solid var(--sp-border); background: white;
  font-size: 12px; color: var(--sp-text); outline: none;
}
.cell-sm { flex: 1; }
.remove-row-btn {
  border: none; background: none; color: var(--sp-orange);
  font-size: 18px; cursor: pointer; flex-shrink: 0; display: flex;
}

.result-summary { padding: 14px 16px; }
.result-line { margin: 0; font-size: 14px; font-weight: 700; }
.result-line.success { color: var(--sp-teal); }
.result-line.error { color: var(--sp-orange); }

.error-row { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; }
.error-icon { color: var(--sp-orange); font-size: 18px; flex-shrink: 0; margin-top: 2px; }
.error-row-title { font-size: 13px; font-weight: 700; margin: 0; }
.error-row-msg { font-size: 12px; color: var(--sp-subtext); margin: 2px 0 0; }
</style>
