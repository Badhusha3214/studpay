<template>
  <ion-page>
    <!-- ── Sidebar ──────────────────────────────────── -->
    <ion-menu content-id="sp-content">
      <ion-header class="ion-no-border">
        <ion-toolbar color="primary">
          <ion-title>StudPay Platform</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <div class="sidebar-profile">
          <div class="sidebar-avatar">{{ initials(auth.student?.name || '') }}</div>
          <div>
            <p class="sidebar-name">{{ auth.student?.name }}</p>
            <p class="sidebar-role">Super Admin</p>
          </div>
        </div>
        <ion-list lines="none">
          <ion-item button :class="{ active: activeTab === 'dashboard' }" @click="activeTab = 'dashboard'">
            <ion-icon :icon="homeOutline" slot="start" />
            <ion-label>Dashboard</ion-label>
          </ion-item>
          <ion-item button :class="{ active: activeTab === 'schools' }" @click="activeTab = 'schools'">
            <ion-icon :icon="schoolOutline" slot="start" />
            <ion-label>Schools</ion-label>
            <ion-badge slot="end" color="primary">{{ schools.length }}</ion-badge>
          </ion-item>
          <ion-item button :class="{ active: activeTab === 'plans' }" @click="activeTab = 'plans'">
            <ion-icon :icon="pricetagsOutline" slot="start" />
            <ion-label>Plans</ion-label>
            <ion-badge slot="end" color="primary">{{ plans.length }}</ion-badge>
          </ion-item>
          <ion-item button :class="{ active: activeTab === 'subscriptions' }" @click="activeTab = 'subscriptions'">
            <ion-icon :icon="cardOutline" slot="start" />
            <ion-label>Subscriptions</ion-label>
            <ion-badge slot="end" color="primary">{{ subscriptions.length }}</ion-badge>
          </ion-item>
          <ion-item button :class="{ active: activeTab === 'admins' }" @click="activeTab = 'admins'">
            <ion-icon :icon="shieldCheckmarkOutline" slot="start" />
            <ion-label>Super Admins</ion-label>
          </ion-item>
        </ion-list>
        <div class="sidebar-footer">
          <ion-item button @click="logout">
            <ion-icon :icon="logOutOutline" slot="start" />
            <ion-label>Sign Out</ion-label>
          </ion-item>
        </div>
      </ion-content>
    </ion-menu>

    <!-- ── Main Content ────────────────────────────────── -->
    <div id="sp-content">
      <ion-header class="ion-no-border">
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-menu-button />
          </ion-buttons>
          <ion-title>{{ tabTitle }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="loadAll">
              <ion-icon :icon="refreshOutline" slot="icon-only" />
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content :fullscreen="true">
          <ion-refresher slot="fixed" @ionRefresh="refresh($event)">
            <ion-refresher-content />
          </ion-refresher>

          <div v-if="loading" class="center"><ion-spinner name="crescent" color="primary" /></div>

          <!-- ══════ DASHBOARD ══════ -->
          <template v-if="activeTab === 'dashboard' && dashboard && !loading">
              <!-- Summary cards -->
              <div class="stats-grid fade-up">
                <div class="stat-card" style="--sc:#6C63FF;--scl:#EDE9FF">
                  <div class="sc-icon"><ion-icon :icon="schoolOutline" /></div>
                  <p class="sc-val">{{ dashboard.schools.total }}</p>
                  <p class="sc-lbl">Total Schools</p>
                  <p class="sc-sub">{{ dashboard.schools.active }} active</p>
                </div>
                <div class="stat-card" style="--sc:#00C9A7;--scl:#D6FBF5">
                  <div class="sc-icon"><ion-icon :icon="peopleOutline" /></div>
                  <p class="sc-val">{{ dashboard.users.students }}</p>
                  <p class="sc-lbl">Students</p>
                  <p class="sc-sub">{{ dashboard.users.parents }} parents</p>
                </div>
                <div class="stat-card" style="--sc:#4DABF7;--scl:#E7F5FF">
                  <div class="sc-icon"><ion-icon :icon="storefrontOutline" /></div>
                  <p class="sc-val">{{ dashboard.users.shopOwners }}</p>
                  <p class="sc-lbl">Shop Owners</p>
                  <p class="sc-sub">{{ dashboard.subscriptions.active }} active subs</p>
                </div>
                <div class="stat-card" style="--sc:#FFD166;--scl:#FFF6E0">
                  <div class="sc-icon"><ion-icon :icon="cashOutline" /></div>
                  <p class="sc-val">₹{{ formatLarge(dashboard.transactions.totalVolume) }}</p>
                  <p class="sc-lbl">Total Volume</p>
                  <p class="sc-sub">{{ dashboard.transactions.count }} transactions</p>
                </div>
              </div>

              <!-- MRR + Quick Actions -->
              <div class="stats-grid fade-up" style="padding-top:0">
                <div class="stat-card" style="--sc:#FF6B6B;--scl:#FFE8E8">
                  <div class="sc-icon"><ion-icon :icon="trendingUpOutline" /></div>
                  <p class="sc-val">₹{{ formatLarge(dashboard.revenue.monthly) }}</p>
                  <p class="sc-lbl">Monthly Recurring Revenue</p>
                  <p class="sc-sub">MRR</p>
                </div>
                <div class="stat-card" style="--sc:#9775FA;--scl:#F3F0FF">
                  <div class="sc-icon"><ion-icon :icon="addCircleOutline" /></div>
                  <p class="sc-val">Quick Actions</p>
                  <p class="sc-lbl">
                    <ion-button fill="clear" size="small" @click="switchTab('schools')">+ New School</ion-button>
                  </p>
                  <p class="sc-sub">
                    <ion-button fill="clear" size="small" @click="switchTab('plans')">+ New Plan</ion-button>
                  </p>
                </div>
              </div>

              <!-- Recent Schools -->
              <p class="sp-section-title">Recently Added Schools</p>
              <div class="list-card fade-up">
                <div v-for="s in dashboard.recentSchools" :key="s.id" class="list-row">
                  <div class="lr-avatar">{{ initials(s.name) }}</div>
                  <div class="lr-info">
                    <p class="lr-title">{{ s.name }}</p>
                    <p class="lr-sub">{{ formatDate(s.created_at) }}</p>
                  </div>
                </div>
                <div v-if="!dashboard.recentSchools.length" class="empty">No schools yet</div>
              </div>
            </template>

            <!-- ══════ SCHOOLS ══════ -->
            <template v-if="activeTab === 'schools' && !loading">
              <div class="toolbar-row">
                <div class="search-box">
                  <ion-icon :icon="searchOutline" class="search-icon" />
                  <ion-input v-model="schoolSearch" placeholder="Search schools..." class="search-input" />
                </div>
                <ion-button size="small" @click="openSchoolModal(null)">
                  <ion-icon :icon="addOutline" slot="start" /> New School
                </ion-button>
              </div>

              <div class="list-card fade-up">
                <div
                  v-for="s in filteredSchools"
                  :key="s.id"
                  class="list-row clickable"
                  @click="openSchoolModal(s)"
                >
                  <div class="lr-avatar">{{ initials(s.name) }}</div>
                  <div class="lr-info">
                    <p class="lr-title">{{ s.name }}</p>
                    <p class="lr-sub">{{ s.student_count || 0 }} students · {{ s.shop_count || 0 }} shops</p>
                  </div>
                  <div class="lr-right">
                    <ion-badge :color="s.subscription_status === 'active' ? 'success' : s.subscription_status === 'trialing' ? 'warning' : 'medium'">
                      {{ s.plan_name || 'No Plan' }}
                    </ion-badge>
                    <ion-button fill="clear" size="small" @click.stop="openSubscriptionModal(s)">
                      <ion-icon :icon="cardOutline" />
                    </ion-button>
                  </div>
                </div>
                <div v-if="!filteredSchools.length" class="empty">No schools found</div>
              </div>
            </template>

            <!-- ══════ PLANS ══════ -->
            <template v-if="activeTab === 'plans' && !loading">
              <div class="toolbar-row">
                <p class="sp-section-title" style="margin:0">Plans ({{ plans.length }})</p>
                <ion-button size="small" @click="openPlanModal(null)">
                  <ion-icon :icon="addOutline" slot="start" /> New Plan
                </ion-button>
              </div>

              <!-- Plan cards -->
              <div class="plans-grid fade-up">
                <div v-for="p in plans" :key="p.id" class="plan-card" @click="openPlanModal(p)">
                  <div class="plan-header">
                    <p class="plan-name">{{ p.name }}</p>
                    <p class="plan-price">₹{{ p.monthly_price.toLocaleString() }}<span>/mo</span></p>
                  </div>
                  <div class="plan-details">
                    <div class="plan-stat">
                      <ion-icon :icon="peopleOutline" />
                      <span>{{ p.student_limit ? p.student_limit.toLocaleString() + ' students' : 'Unlimited students' }}</span>
                    </div>
                    <div class="plan-stat">
                      <ion-icon :icon="storefrontOutline" />
                      <span>{{ p.shop_limit ? p.shop_limit + ' shops' : 'Unlimited shops' }}</span>
                    </div>
                  </div>
                  <div class="plan-footer">
                    <ion-badge color="primary">{{ p.subscriber_count || 0 }} active</ion-badge>
                  </div>
                </div>
              </div>
            </template>

            <!-- ══════ SUBSCRIPTIONS ══════ -->
            <template v-if="activeTab === 'subscriptions' && !loading">
              <div class="toolbar-row">
                <p class="sp-section-title" style="margin:0">Subscriptions ({{ subscriptions.length }})</p>
              </div>
              <div class="list-card fade-up">
                <div v-for="s in subscriptions" :key="s.id" class="list-row clickable" @click="openSubDetail(s)">
                  <div class="lr-avatar">{{ initials(s.school_name) }}</div>
                  <div class="lr-info">
                    <p class="lr-title">{{ s.school_name }}</p>
                    <p class="lr-sub">{{ s.plan_name }} · ₹{{ s.monthly_price }}/mo · {{ s.billing_cycle }}</p>
                  </div>
                  <div class="lr-right">
                    <ion-badge :color="s.status === 'active' ? 'success' : s.status === 'trialing' ? 'warning' : 'danger'">
                      {{ s.status }}
                    </ion-badge>
                  </div>
                </div>
                <div v-if="!subscriptions.length" class="empty">No subscriptions</div>
              </div>
            </template>

            <!-- ══════ SUPER ADMINS ══════ -->
            <template v-if="activeTab === 'admins' && !loading">
              <div class="toolbar-row">
                <p class="sp-section-title" style="margin:0">Super Admins</p>
                <ion-button size="small" @click="showAdminModal = true">
                  <ion-icon :icon="addOutline" slot="start" /> New Admin
                </ion-button>
              </div>
              <div class="list-card fade-up">
                <div v-for="a in superAdmins" :key="a.id" class="list-row">
                  <div class="lr-avatar">{{ initials(a.name) }}</div>
                  <div class="lr-info">
                    <p class="lr-title">{{ a.name }}</p>
                    <p class="lr-sub">{{ a.email }}</p>
                  </div>
                  <ion-badge color="dark">super_admin</ion-badge>
                </div>
                <div v-if="!superAdmins.length" class="empty">No super admins</div>
              </div>
            </template>

            <div style="height: 24px" />
          </ion-content>
      </div>

    <!-- ══ SCHOOL MODAL ══ -->
    <ion-modal :is-open="showSchoolModal" @didDismiss="showSchoolModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button @click="showSchoolModal = false">Cancel</ion-button>
          </ion-buttons>
          <ion-title>{{ editingSchool ? 'Edit School' : 'New School' }}</ion-title>
          <ion-buttons slot="end">
            <ion-button :strong="true" @click="saveSchool" :disabled="!schoolForm.name">Save</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-item>
          <ion-label position="stacked">School Name *</ion-label>
          <ion-input v-model="schoolForm.name" placeholder="e.g. Springfield Academy" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Contact Email</ion-label>
          <ion-input v-model="schoolForm.contactEmail" type="email" placeholder="admin@school.edu" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Contact Phone</ion-label>
          <ion-input v-model="schoolForm.contactPhone" placeholder="+91-9876543210" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Address</ion-label>
          <ion-input v-model="schoolForm.address" placeholder="123 School Road, City" />
        </ion-item>
        <ion-item v-if="editingSchool">
          <ion-label>Active</ion-label>
          <ion-toggle v-model="schoolForm.active" />
        </ion-item>
      </ion-content>
    </ion-modal>

    <!-- ══ SCHOOL SUBSCRIPTION MODAL ══ -->
    <ion-modal :is-open="showSubAssignModal" @didDismiss="showSubAssignModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button @click="showSubAssignModal = false">Cancel</ion-button>
          </ion-buttons>
          <ion-title>Assign Plan to {{ subAssignSchool?.name }}</ion-title>
          <ion-buttons slot="end">
            <ion-button :strong="true" @click="assignSubscription" :disabled="!subAssignPlanId">Save</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-list radio-group v-model="subAssignPlanId">
          <ion-item v-for="p in plans" :key="p.id">
            <ion-label>
              <p class="sub-plan-name">{{ p.name }}</p>
              <p class="sub-plan-price">₹{{ p.monthly_price.toLocaleString() }}/mo</p>
            </ion-label>
            <ion-radio :value="p.id" />
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-modal>

    <!-- ══ PLAN MODAL ══ -->
    <ion-modal :is-open="showPlanModal" @didDismiss="showPlanModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button @click="showPlanModal = false">Cancel</ion-button>
          </ion-buttons>
          <ion-title>{{ editingPlan ? 'Edit Plan' : 'New Plan' }}</ion-title>
          <ion-buttons slot="end">
            <ion-button :strong="true" @click="savePlan" :disabled="!planForm.name">Save</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-item>
          <ion-label position="stacked">Plan Name *</ion-label>
          <ion-input v-model="planForm.name" placeholder="e.g. Pro" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Monthly Price (₹)</ion-label>
          <ion-input v-model.number="planForm.monthlyPrice" type="number" placeholder="0" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Student Limit (blank = unlimited)</ion-label>
          <ion-input v-model.number="planForm.studentLimit" type="number" placeholder="Leave blank for unlimited" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Shop Limit (blank = unlimited)</ion-label>
          <ion-input v-model.number="planForm.shopLimit" type="number" placeholder="Leave blank for unlimited" />
        </ion-item>
      </ion-content>
    </ion-modal>

    <!-- ══ SUBSCRIPTION DETAIL MODAL ══ -->
    <ion-modal :is-open="showSubDetailModal" @didDismiss="showSubDetailModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button @click="showSubDetailModal = false">Close</ion-button>
          </ion-buttons>
          <ion-title>{{ subDetail?.school_name }} Subscription</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-list v-if="subDetail" lines="none">
          <ion-item>
            <ion-label>
              <p class="detail-label">School</p>
              <p class="detail-val">{{ subDetail.school_name }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              <p class="detail-label">Plan</p>
              <p class="detail-val">{{ subDetail.plan_name }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              <p class="detail-label">Price</p>
              <p class="detail-val">₹{{ subDetail.monthly_price }}/mo</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              <p class="detail-label">Status</p>
              <ion-badge :color="subDetail.status === 'active' ? 'success' : subDetail.status === 'trialing' ? 'warning' : 'danger'">
                {{ subDetail.status }}
              </ion-badge>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              <p class="detail-label">Billing Cycle</p>
              <p class="detail-val">{{ subDetail.billing_cycle }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              <p class="detail-label">Period Start</p>
              <p class="detail-val">{{ formatDate(subDetail.current_period_start) }}</p>
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label>
              <p class="detail-label">Period End</p>
              <p class="detail-val">{{ formatDate(subDetail.current_period_end) }}</p>
            </ion-label>
          </ion-item>
          <ion-item v-if="subDetail.cancelled_at">
            <ion-label>
              <p class="detail-label">Cancelled At</p>
              <p class="detail-val cancelled">{{ formatDate(subDetail.cancelled_at) }}</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <div v-if="subDetail" class="modal-actions">
          <ion-button expand="block" color="danger" fill="outline" @click="cancelSubscription(subDetail)">
            Cancel Subscription
          </ion-button>
        </div>
      </ion-content>
    </ion-modal>

    <!-- ══ CREATE ADMIN MODAL ══ -->
    <ion-modal :is-open="showAdminModal" @didDismiss="showAdminModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button @click="showAdminModal = false">Cancel</ion-button>
          </ion-buttons>
          <ion-title>New Super Admin</ion-title>
          <ion-buttons slot="end">
            <ion-button :strong="true" @click="createAdmin" :disabled="!adminForm.name || !adminForm.email || !adminForm.pin">Save</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-item>
          <ion-label position="stacked">Full Name *</ion-label>
          <ion-input v-model="adminForm.name" placeholder="e.g. Admin Name" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Email *</ion-label>
          <ion-input v-model="adminForm.email" type="email" placeholder="admin@studpay.app" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">PIN *</ion-label>
          <ion-input v-model="adminForm.pin" type="password" :maxlength="6" placeholder="4-6 digit PIN" />
        </ion-item>
      </ion-content>
    </ion-modal>

    <!-- ══ TOAST ══ -->
    <ion-toast
      :is-open="!!toastMsg"
      :message="toastMsg"
      :color="toastColor"
      :duration="3000"
      @didDismiss="toastMsg = ''"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
  IonIcon, IonSpinner, IonRefresher, IonRefresherContent, IonLabel, IonBadge,
  IonModal, IonItem, IonInput, IonList, IonRadio, IonRadioGroup, IonToggle,
  IonToast, IonMenu, IonMenuButton,
  alertController,
} from '@ionic/vue';
import {
  logOutOutline, addOutline, homeOutline, schoolOutline, peopleOutline,
  storefrontOutline, cashOutline, trendingUpOutline, addCircleOutline,
  pricetagsOutline, cardOutline, shieldCheckmarkOutline, refreshOutline,
  searchOutline, chevronForwardOutline, timeOutline,
} from 'ionicons/icons';
import api from '@/composables/useApi';
import { useAuthStore } from '@/store/auth';

interface Dashboard {
  schools: { total: number; active: number };
  users: { students: number; parents: number; shopOwners: number };
  transactions: { count: number; totalVolume: number };
  subscriptions: { active: number };
  revenue: { monthly: number };
  recentSchools: Array<{ id: string; name: string; created_at: string }>;
}

interface School {
  id: string; name: string; contact_email?: string; contact_phone?: string;
  address?: string; active: number; student_count?: number; shop_count?: number;
  subscription_status?: string; plan_name?: string;
}

interface Plan {
  id: string; name: string; monthly_price: number;
  student_limit?: number; shop_limit?: number;
  features?: string[]; subscriber_count?: number;
}

interface Subscription {
  id: string; school_id: string; school_name: string;
  plan_id: string; plan_name: string; monthly_price: number;
  status: string; billing_cycle: string;
  current_period_start: string; current_period_end: string; cancelled_at?: string;
}

interface SuperAdmin {
  id: string; name: string; email: string;
}

const router = useRouter();
const auth = useAuthStore();

const loading = ref(true);
const activeTab = ref('dashboard');
const toastMsg = ref('');
const toastColor = ref('success');
const schoolSearch = ref('');

const dashboard = ref<Dashboard | null>(null);
const schools = ref<School[]>([]);
const plans = ref<Plan[]>([]);
const subscriptions = ref<Subscription[]>([]);
const superAdmins = ref<SuperAdmin[]>([]);

// School modal
const showSchoolModal = ref(false);
const editingSchool = ref<School | null>(null);
const schoolForm = reactive({ name: '', contactEmail: '', contactPhone: '', address: '', active: true });

// Subscription assign modal
const showSubAssignModal = ref(false);
const subAssignSchool = ref<School | null>(null);
const subAssignPlanId = ref('');

// Plan modal
const showPlanModal = ref(false);
const editingPlan = ref<Plan | null>(null);
const planForm = reactive({ name: '', monthlyPrice: 0, studentLimit: null as number | null, shopLimit: null as number | null });

// Subscription detail modal
const showSubDetailModal = ref(false);
const subDetail = ref<Subscription | null>(null);

// Admin modal
const showAdminModal = ref(false);
const adminForm = reactive({ name: '', email: '', pin: '' });

const tabTitle = computed(() => {
  const titles: Record<string, string> = {
    dashboard: 'Platform Dashboard',
    schools: 'Schools Management',
    plans: 'Billing Plans',
    subscriptions: 'Subscriptions',
    admins: 'Super Admins',
  };
  return titles[activeTab.value] || 'StudPay Platform';
});

const filteredSchools = computed(() => {
  if (!schoolSearch.value) return schools.value;
  const q = schoolSearch.value.toLowerCase();
  return schools.value.filter((s) => s.name.toLowerCase().includes(q));
});

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

function formatDate(dt: string) {
  return new Date(dt).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatLarge(n: number) {
  if (n >= 100000) return (n / 100000).toFixed(1) + 'L';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toFixed(0);
}

function showToast(msg: string, color = 'success') {
  toastMsg.value = msg;
  toastColor.value = color;
}

function switchTab(tab: string) {
  activeTab.value = tab;
}

async function loadDashboard() {
  try {
    const { data: res } = await api.get('/superadmin/dashboard');
    dashboard.value = res;
  } catch (err: any) {
    showToast(err?.response?.data?.error || 'Failed to load dashboard', 'danger');
  }
}

async function loadSchools() {
  try {
    const { data: res } = await api.get('/superadmin/schools');
    schools.value = res;
  } catch (err: any) {
    showToast('Failed to load schools', 'danger');
  }
}

async function loadPlans() {
  try {
    const { data: res } = await api.get('/superadmin/plans');
    plans.value = res;
  } catch (err: any) {
    showToast('Failed to load plans', 'danger');
  }
}

async function loadSubscriptions() {
  try {
    const { data: res } = await api.get('/superadmin/subscriptions');
    subscriptions.value = res;
  } catch (err: any) {
    showToast('Failed to load subscriptions', 'danger');
  }
}

async function loadSuperAdmins() {
  try {
    const { data: res } = await api.get('/superadmin/admins');
    superAdmins.value = res;
  } catch { /* not critical */ }
}

async function loadAll() {
  loading.value = true;
  await Promise.all([loadDashboard(), loadSchools(), loadPlans(), loadSubscriptions()]);
  loading.value = false;
}

async function refresh(event: any) { await loadAll(); event.target.complete(); }

// ── School ──

function openSchoolModal(s: School | null) {
  editingSchool.value = s;
  schoolForm.name = s?.name || '';
  schoolForm.contactEmail = s?.contact_email || '';
  schoolForm.contactPhone = s?.contact_phone || '';
  schoolForm.address = s?.address || '';
  schoolForm.active = s ? s.active === 1 : true;
  showSchoolModal.value = true;
}

async function saveSchool() {
  try {
    if (editingSchool.value) {
      await api.patch(`/superadmin/schools/${editingSchool.value.id}`, {
        name: schoolForm.name,
        contactEmail: schoolForm.contactEmail || null,
        contactPhone: schoolForm.contactPhone || null,
        address: schoolForm.address || null,
        active: schoolForm.active,
      });
      showToast('School updated');
    } else {
      await api.post('/superadmin/schools', {
        name: schoolForm.name,
        contactEmail: schoolForm.contactEmail || null,
        contactPhone: schoolForm.contactPhone || null,
        address: schoolForm.address || null,
      });
      showToast('School created with free trial');
    }
    showSchoolModal.value = false;
    editingSchool.value = null;
    await Promise.all([loadSchools(), loadDashboard()]);
  } catch (err: any) {
    showToast(err?.response?.data?.error || 'Failed to save school', 'danger');
  }
}

// ── Subscription Assign ──

function openSubscriptionModal(s: School) {
  subAssignSchool.value = s;
  subAssignPlanId.value = '';
  showSubAssignModal.value = true;
}

async function assignSubscription() {
  if (!subAssignSchool.value || !subAssignPlanId.value) return;
  try {
    await api.post('/superadmin/subscriptions', {
      schoolId: subAssignSchool.value.id,
      planId: subAssignPlanId.value,
    });
    showToast(`Assigned plan to ${subAssignSchool.value.name}`);
    showSubAssignModal.value = false;
    await Promise.all([loadSchools(), loadSubscriptions()]);
  } catch (err: any) {
    showToast(err?.response?.data?.error || 'Failed to assign plan', 'danger');
  }
}

// ── Plan ──

function openPlanModal(p: Plan | null) {
  editingPlan.value = p;
  planForm.name = p?.name || '';
  planForm.monthlyPrice = p?.monthly_price ?? 0;
  planForm.studentLimit = p?.student_limit ?? null;
  planForm.shopLimit = p?.shop_limit ?? null;
  showPlanModal.value = true;
}

async function savePlan() {
  try {
    if (editingPlan.value) {
      await api.patch(`/superadmin/plans/${editingPlan.value.id}`, planForm);
      showToast('Plan updated');
    } else {
      await api.post('/superadmin/plans', planForm);
      showToast('Plan created');
    }
    showPlanModal.value = false;
    editingPlan.value = null;
    await loadPlans();
  } catch (err: any) {
    showToast(err?.response?.data?.error || 'Failed to save plan', 'danger');
  }
}

// ── Subscription Detail ──

function openSubDetail(s: Subscription) {
  subDetail.value = s;
  showSubDetailModal.value = true;
}

async function cancelSubscription(s: Subscription) {
  const alert = await alertController.create({
    header: 'Cancel Subscription',
    message: `Cancel ${s.school_name}'s ${s.plan_name} subscription?`,
    buttons: [
      { text: 'Keep Active', role: 'cancel' },
      {
        text: 'Cancel', role: 'destructive',
        handler: async () => {
          try {
            await api.patch(`/superadmin/subscriptions/${s.id}`, { status: 'cancelled' });
            showToast('Subscription cancelled');
            showSubDetailModal.value = false;
            await Promise.all([loadSubscriptions(), loadSchools()]);
          } catch (err: any) {
            showToast('Failed to cancel subscription', 'danger');
          }
        },
      },
    ],
  });
  await alert.present();
}

// ── Admin ──

async function createAdmin() {
  try {
    await api.post('/superadmin/admins', {
      name: adminForm.name,
      email: adminForm.email,
      pin: adminForm.pin,
    });
    showToast(`Super admin ${adminForm.name} created`);
    showAdminModal.value = false;
    Object.assign(adminForm, { name: '', email: '', pin: '' });
    await loadSuperAdmins();
  } catch (err: any) {
    showToast(err?.response?.data?.error || 'Failed to create admin', 'danger');
  }
}

function logout() { auth.logout(); router.replace('/login'); }

onMounted(async () => {
  await loadAll();
  await loadSuperAdmins();
});
</script>

<style scoped>
/* ── Split Pane / Sidebar ── */
.sidebar-profile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px 8px;
  border-bottom: 1px solid var(--ion-color-step-200, #e0e0e0);
  margin-bottom: 8px;
}
.sidebar-avatar {
  width: 40px; height: 40px; border-radius: 10px;
  background: var(--ion-color-primary);
  color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; flex-shrink: 0;
}
.sidebar-name { font-size: 14px; font-weight: 700; margin: 0; }
.sidebar-role { font-size: 11px; color: var(--ion-color-medium); margin: 2px 0 0; text-transform: uppercase; letter-spacing: 0.05em; }
.sidebar-footer { position: absolute; bottom: 0; left: 0; right: 0; border-top: 1px solid var(--ion-color-step-200, #e0e0e0); }

ion-menu ion-item { --border-radius: 8px; margin: 2px 8px; }
ion-menu ion-item.active {
  --background: var(--ion-color-primary-tint, #d0d9ff);
  --color: var(--ion-color-primary);
  font-weight: 700;
}

/* ── Stats Grid ── */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; padding: 14px; }
.stat-card {
  background: var(--scl); border-radius: 18px; padding: 18px;
  display: flex; flex-direction: column; gap: 4px;
  transition: transform 0.15s;
}
.stat-card:hover { transform: translateY(-2px); }
.sc-icon { font-size: 24px; color: var(--sc); margin-bottom: 8px; }
.sc-val { font-size: 24px; font-weight: 800; color: var(--sc); margin: 0; overflow-wrap: anywhere; }
.sc-lbl { font-size: 12px; color: var(--ion-color-medium); margin: 2px 0 0; font-weight: 600; }
.sc-sub { font-size: 10px; color: var(--ion-color-medium); margin: 0; }
.stat-card ion-button { --padding-start: 0; --padding-end: 0; margin: 0; height: auto; font-size: 12px; }

/* ── Toolbar / Search ── */
.toolbar-row { display: flex; align-items: center; gap: 10px; padding: 8px 14px; }
.search-box { flex: 1; display: flex; align-items: center; background: var(--ion-color-step-50, #f5f5f5); border-radius: 10px; padding: 0 10px; }
.search-icon { color: var(--ion-color-medium); font-size: 18px; margin-right: 8px; flex-shrink: 0; }
.search-input { --background: transparent; --padding-start: 0; --padding-end: 0; }

.sp-section-title { font-size: 12px; font-weight: 700; color: var(--ion-color-medium); padding: 8px 14px 4px; text-transform: uppercase; letter-spacing: 0.5px; }

/* ── List Card ── */
.list-card { padding: 0 14px; display: flex; flex-direction: column; gap: 8px; }
.list-row {
  display: flex; align-items: center; gap: 12px;
  background: white; border-radius: 14px; padding: 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  transition: box-shadow 0.15s;
}
.list-row.clickable { cursor: pointer; }
.list-row.clickable:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.lr-avatar {
  width: 38px; height: 38px; border-radius: 10px;
  background: var(--ion-color-primary-tint, #eef0ff);
  color: var(--ion-color-primary);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; flex-shrink: 0;
}
.lr-info { flex: 1; min-width: 0; }
.lr-title { font-size: 14px; font-weight: 700; margin: 0; color: var(--ion-color-dark); }
.lr-sub { font-size: 12px; color: var(--ion-color-medium); margin: 2px 0 0; }
.lr-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.empty { text-align: center; padding: 32px; color: var(--ion-color-medium); font-size: 14px; }
.center { display: flex; justify-content: center; padding: 32px; }

/* ── Plans Grid ── */
.plans-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; padding: 14px; }
.plan-card {
  background: white; border-radius: 16px; padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;
}
.plan-card:hover { transform: translateY(-3px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.plan-header { margin-bottom: 14px; }
.plan-name { font-size: 16px; font-weight: 800; margin: 0; color: var(--ion-color-dark); }
.plan-price { font-size: 22px; font-weight: 800; color: var(--ion-color-primary); margin: 8px 0 0; }
.plan-price span { font-size: 13px; font-weight: 600; color: var(--ion-color-medium); }
.plan-details { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.plan-stat { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ion-color-medium); }
.plan-stat ion-icon { font-size: 16px; color: var(--ion-color-primary); }
.plan-footer { display: flex; align-items: center; gap: 8px; }

/* ── Modal ── */
.detail-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ion-color-medium); margin: 0 0 2px; }
.detail-val { font-size: 15px; font-weight: 600; margin: 0; color: var(--ion-color-dark); }
.detail-val.cancelled { color: var(--ion-color-danger); }
.modal-actions { padding: 16px; }
.sub-plan-name { font-size: 14px; font-weight: 700; margin: 0; }
.sub-plan-price { font-size: 12px; color: var(--ion-color-medium); margin: 2px 0 0; }

ion-menu { --width: 260px; }
ion-menu ion-content { --padding-top: 0; }
</style>
