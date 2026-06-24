import { Timestamp } from 'firebase/firestore';

export interface Transaction {
  id: string;
  date: Timestamp | string; // Firebase Timestamp or ISO date string
  type: 'ingreso' | 'egreso';
  amount: number;
  method: string;
  category: string;
  description: string;
  refId?: string; // Reference to Student ID, Event ID, or Sale ID
  createdBy: string;
  // Campos estructurados para pagos de nómina (evitan depender del texto de la descripción)
  instructorName?: string;
  period?: string; // YYYY-MM
}

export interface InventoryItem {
  id: string;
  name: string;
  stock: number;
  price: number;
  cost: number;
  minStock: number;
}

export interface StoreSale {
  id: string;
  saleNumber: string;
  date: Timestamp | string;
  items: Array<{
    itemId: string;
    name: string;
    qty: number;
    price: number;
  }>;
  total: number;
  paymentMethod: string;
  customerId?: string;
  customerName: string;
  notes?: string;
}

export interface BhumiEvent {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  price: number;
  capacity: number;
  registeredStudents: string[]; // List of student IDs or names
  expenses: number;
  status: 'activo' | 'completado' | 'cancelado';
}

export interface CashReconciliation {
  id: string;
  date: Timestamp | string;
  denomCount: Record<string, number>; // e.g., { '50000': 2, '20000': 5 }
  totalExpected: number;
  totalPhysical: number;
  difference: number;
  reconciledBy: string;
  notes?: string;
}

export interface Student {
  id: string;
  name: string;
  prog: string;
  pack: number;
  inicio: string;
  fin: string;
  nota?: string;
  fechas?: string[];
  historialFechas?: string[];
  renovaciones?: Array<{
    fecha: string;
    packAnterior: number;
    clasesArchivadas: number;
    packNuevo: number;
  }>;
}

export interface InstructorRate {
  instructorId: string; // e.g. Sharon, Daniel
  rates: Record<string, number>; // ProgramName -> Payout rate (e.g. { 'Hatha Yoga': 60000 })
}

export interface ClassSchedule {
  id: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday...
  time: string; // HH:MM
  program: string;
  instructor: string; // Name of instructor
}
