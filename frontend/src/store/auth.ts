import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/composables/useApi';

export interface Student {
  id: string;
  name: string;
  email: string;
  class: string;
  balance: number;
  role: 'student' | 'parent' | 'shop_owner';
  merchant_name?: string;
}

export interface Child {
  id: string;
  name: string;
  email: string;
  class: string;
  balance: number;
  card_uid: string | null;
}

export const useAuthStore = defineStore('auth', () => {
  const token   = ref<string | null>(localStorage.getItem('sp_token'));
  const student = ref<Student | null>(JSON.parse(localStorage.getItem('sp_student') || 'null'));

  const isParent = computed(() => student.value?.role === 'parent');

  const children        = ref<Child[]>([]);
  const selectedChildId = ref('');
  const selectedChild   = computed(() => children.value.find((c) => c.id === selectedChildId.value) ?? null);

  async function login(email: string, pin: string) {
    const { data } = await api.post('/auth/login', { email, pin });
    token.value   = data.token;
    student.value = data.student;
    localStorage.setItem('sp_token', data.token);
    localStorage.setItem('sp_student', JSON.stringify(data.student));
  }

  function logout() {
    token.value           = null;
    student.value         = null;
    children.value        = [];
    selectedChildId.value = '';
    localStorage.removeItem('sp_token');
    localStorage.removeItem('sp_student');
  }

  function updateBalance(newBalance: number) {
    if (student.value) {
      student.value.balance = newBalance;
      localStorage.setItem('sp_student', JSON.stringify(student.value));
    }
  }

  async function loadChildren() {
    const { data } = await api.get('/parent/children');
    children.value = data;
    if (!selectedChildId.value && data.length) selectedChildId.value = data[0].id;
  }

  function updateChildBalance(childId: string, newBalance: number) {
    const child = children.value.find((c) => c.id === childId);
    if (child) child.balance = newBalance;
  }

  return {
    token, student, isParent,
    children, selectedChildId, selectedChild,
    login, logout, updateBalance,
    loadChildren, updateChildBalance,
  };
});
