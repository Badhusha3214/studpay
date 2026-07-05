import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/store/auth';

const routes: Array<RouteRecordRaw> = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: () => import('@/views/LoginView.vue') },
  {
    path: '/app',
    component: () => import('@/views/TabsLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/app/wallet' },
      { path: 'wallet',  component: () => import('@/views/WalletView.vue') },
      { path: 'history', component: () => import('@/views/HistoryView.vue') },
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
});

export default router;
