import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/composables/useApi';

export interface Student {
  id: string;
  name: string;
  email: string;
  class: string;
  balance: number;
  role: 'student' | 'admin';
}

export const useAuthStore = defineStore('auth', () => {
  const token   = ref<string | null>(localStorage.getItem('sp_token'));
  const student = ref<Student | null>(JSON.parse(localStorage.getItem('sp_student') || 'null'));

  const isAdmin = computed(() => student.value?.role === 'admin');

  async function login(email: string, pin: string) {
    const { data } = await api.post('/auth/login', { email, pin });
    token.value   = data.token;
    student.value = data.student;
    localStorage.setItem('sp_token', data.token);
    localStorage.setItem('sp_student', JSON.stringify(data.student));
  }

  function logout() {
    token.value   = null;
    student.value = null;
    localStorage.removeItem('sp_token');
    localStorage.removeItem('sp_student');
  }

  function updateBalance(newBalance: number) {
    if (student.value) {
      student.value.balance = newBalance;
      localStorage.setItem('sp_student', JSON.stringify(student.value));
    }
  }

  return { token, student, isAdmin, login, logout, updateBalance };
});
