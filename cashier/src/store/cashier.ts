import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/composables/useApi';

export interface Student {
  name: string;
  class: string;
  balance: number;
  uid: string;
}

export interface Transaction {
  id: string;
  amount: number;
  description: string;
  merchant: string;
  balance_after: number;
  created_at: string;
}

export const useCashierStore = defineStore('cashier', () => {
  const token   = ref<string | null>(localStorage.getItem('cashier_token'));
  const cashier = ref<any>(JSON.parse(localStorage.getItem('cashier_user') || 'null'));

  const scannedUid      = ref('');
  const scannedStudent  = ref<Student | null>(null);
  const pendingAmount   = ref(0);
  const pendingMerchant = ref('');
  const pendingDesc     = ref('');
  const lastTransaction = ref<Transaction | null>(null);

  async function login(email: string, pin: string) {
    const { data } = await api.post('/auth/login', { email, pin });
    if (data.student.role !== 'admin') throw new Error('Cashier must be an admin account');
    token.value   = data.token;
    cashier.value = data.student;
    localStorage.setItem('cashier_token', data.token);
    localStorage.setItem('cashier_user', JSON.stringify(data.student));
  }

  function logout() {
    token.value   = null;
    cashier.value = null;
    localStorage.removeItem('cashier_token');
    localStorage.removeItem('cashier_user');
  }

  function setPending(amount: number, merchant: string, desc: string) {
    pendingAmount.value   = amount;
    pendingMerchant.value = merchant;
    pendingDesc.value     = desc;
  }

  function setScanned(uid: string, student: Student) {
    scannedUid.value     = uid;
    scannedStudent.value = student;
  }

  function setLastTransaction(txn: Transaction) {
    lastTransaction.value = txn;
  }

  function reset() {
    scannedUid.value      = '';
    scannedStudent.value  = null;
    pendingAmount.value   = 0;
    pendingMerchant.value = '';
    pendingDesc.value     = '';
  }

  return {
    token, cashier,
    scannedUid, scannedStudent,
    pendingAmount, pendingMerchant, pendingDesc,
    lastTransaction,
    login, logout, setPending, setScanned, setLastTransaction, reset,
  };
});
