import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/store/auth';

const routes: Array<RouteRecordRaw> = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: () => import('@/views/LoginView.vue') },
  { path: '/register', component: () => import('@/views/RegisterView.vue') },
  {
    path: '/app',
    component: () => import('@/views/TabsLayout.vue'),
    meta: { requiresAuth: true, allowedRoles: ['student', 'parent'] },
    children: [
      { path: '', redirect: '/app/wallet' },
      { path: 'wallet',  component: () => import('@/views/WalletView.vue') },
      { path: 'history', component: () => import('@/views/HistoryView.vue') },
      { path: 'manage',  component: () => import('@/views/ManageView.vue') },
      { path: 'insights', component: () => import('@/views/InsightsView.vue') },
    ],
  },
  {
    path: '/pay',
    component: () => import('@/views/cashier/TapToPayView.vue'),
    meta: { requiresAuth: true, allowedRoles: ['shop_owner'] },
  },
  {
    path: '/pin',
    component: () => import('@/views/cashier/PinEntryView.vue'),
    meta: { requiresAuth: true, allowedRoles: ['shop_owner'] },
  },
  {
    path: '/receipt',
    component: () => import('@/views/cashier/ReceiptView.vue'),
    meta: { requiresAuth: true, allowedRoles: ['shop_owner'] },
  },
  {
    path: '/dashboard',
    component: () => import('@/views/cashier/DashboardView.vue'),
    meta: { requiresAuth: true, allowedRoles: ['shop_owner'] },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.token) return '/login';

  const allowedRoles = to.meta.allowedRoles as string[] | undefined;
  if (allowedRoles && auth.student && !allowedRoles.includes(auth.student.role)) {
    return auth.student.role === 'shop_owner' ? '/pay' : '/app/wallet';
  }
});

export default router;
