import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/store/auth';

const routes: Array<RouteRecordRaw> = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: () => import('@/views/LoginView.vue') },
  { path: '/register', component: () => import('@/views/RegisterView.vue') },
  {
    path: '/platform',
    component: () => import('@/views/SuperAdminView.vue'),
    meta: { requiresAuth: true, allowedRoles: ['super_admin'] },
  },
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
    meta: { requiresAuth: true, allowedRoles: ['shop_owner', 'cashier'] },
  },
  {
    path: '/pin',
    component: () => import('@/views/cashier/PinEntryView.vue'),
    meta: { requiresAuth: true, allowedRoles: ['shop_owner', 'cashier'] },
  },
  {
    path: '/receipt',
    component: () => import('@/views/cashier/ReceiptView.vue'),
    meta: { requiresAuth: true, allowedRoles: ['shop_owner', 'cashier'] },
  },
  {
    path: '/dashboard',
    component: () => import('@/views/cashier/DashboardView.vue'),
    meta: { requiresAuth: true, allowedRoles: ['shop_owner', 'cashier'] },
  },
  {
    path: '/orders',
    component: () => import('@/views/cashier/OrdersView.vue'),
    meta: { requiresAuth: true, allowedRoles: ['shop_owner', 'cashier'] },
  },
  {
    path: '/admin',
    component: () => import('@/views/admin/AdminLayout.vue'),
    meta: { requiresAuth: true, allowedRoles: ['school_admin'] },
    children: [
      { path: '', redirect: '/admin/dashboard' },
      { path: 'dashboard', component: () => import('@/views/admin/DashboardView.vue') },
      { path: 'students', component: () => import('@/views/admin/StudentsView.vue') },
      { path: 'students/bulk-import', component: () => import('@/views/admin/BulkImportView.vue') },
      { path: 'analytics', component: () => import('@/views/admin/AnalyticsView.vue') },
      { path: 'cards', component: () => import('@/views/admin/CardsView.vue') },
      { path: 'staff', component: () => import('@/views/admin/StaffAccountsView.vue') },
      { path: 'shops', component: () => import('@/views/admin/ShopsView.vue') },
      { path: 'approvals', component: () => import('@/views/admin/ApprovalsView.vue') },
      { path: 'reports', component: () => import('@/views/admin/ReportsView.vue') },
      { path: 'refunds', component: () => import('@/views/admin/RefundsView.vue') },
    ],
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
    if (auth.student.role === 'super_admin') return '/platform';
    if (auth.student.role === 'shop_owner' || auth.student.role === 'cashier') return '/pay';
    if (auth.student.role === 'school_admin') return '/admin/dashboard';
    return '/app/wallet';
  }
});

export default router;
