import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import { useCashierStore } from '@/store/cashier';

const routes: Array<RouteRecordRaw> = [
  { path: '/', redirect: '/login' },
  { path: '/login',   component: () => import('@/views/LoginView.vue') },
  { path: '/pay',       component: () => import('@/views/TapToPayView.vue'),  meta: { requiresAuth: true } },
  { path: '/pin',       component: () => import('@/views/PinEntryView.vue'),  meta: { requiresAuth: true } },
  { path: '/receipt',   component: () => import('@/views/ReceiptView.vue'),   meta: { requiresAuth: true } },
  { path: '/dashboard', component: () => import('@/views/DashboardView.vue'), meta: { requiresAuth: true } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const store = useCashierStore();
  if (to.meta.requiresAuth && !store.token) return '/login';
});

export default router;
