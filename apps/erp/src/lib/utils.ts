import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateInput: any): string {
  if (!dateInput) return '';

  let dateObj: Date;
  if (dateInput.seconds) {
    // Firestore Timestamp — ya en UTC, convertir a local
    dateObj = new Date(dateInput.seconds * 1000);
  } else if (dateInput instanceof Date) {
    dateObj = dateInput;
  } else if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    // ISO date string: parsear como medianoche local para evitar desfase UTC
    const [y, m, d] = dateInput.split('-').map(Number);
    dateObj = new Date(y, m - 1, d);
  } else {
    dateObj = new Date(dateInput);
  }

  if (isNaN(dateObj.getTime())) return '';

  return dateObj.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
