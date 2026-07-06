import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface Student {
  name: string;
  class: string;
  balance: number;
  uid: string;
  allergies?: string | null;
}

export interface Transaction {
  id: string;
  amount: number;
  description: string;
  merchant: string;
  balance_after: number;
  emergency_amount?: number;
  created_at: string;
}

// Transient state for the shop-owner tap-to-pay flow. Identity/login lives in
// useAuthStore — this store only holds what's mid-flight between Pay -> Pin -> Receipt.
export const useCashierStore = defineStore('cashier', () => {
  const scannedUid      = ref('');
  const scannedStudent  = ref<Student | null>(null);
  const pendingAmount   = ref(0);
  const pendingDesc     = ref('');
  const lastTransaction = ref<Transaction | null>(null);

  function setPending(amount: number, desc: string) {
    pendingAmount.value = amount;
    pendingDesc.value   = desc;
  }

  function setScanned(uid: string, student: Student) {
    scannedUid.value     = uid;
    scannedStudent.value = student;
  }

  function setLastTransaction(txn: Transaction) {
    lastTransaction.value = txn;
  }

  function reset() {
    scannedUid.value     = '';
    scannedStudent.value = null;
    pendingAmount.value  = 0;
    pendingDesc.value    = '';
  }

  return {
    scannedUid, scannedStudent,
    pendingAmount, pendingDesc,
    lastTransaction,
    setPending, setScanned, setLastTransaction, reset,
  };
});
