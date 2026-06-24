import React, { useState, useMemo, useEffect } from 'react';
import { Student, Transaction } from '../types';
import { formatCurrency, formatDate } from '../lib/utils';
import { db, auth } from '../lib/firebase';
import { doc, updateDoc, arrayUnion, collection, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { differenceInDays, parseISO, addDays, format } from 'date-fns';
import {
  Search, ChevronDown, AlertTriangle,
  User, CreditCard, Calendar, RefreshCw,
  CheckCircle2, DollarSign, Receipt, Save,
} from 'lucide-react';
import { openReceipt } from '../lib/receipt';
import Modal from '../components/Modal';

interface EstudiantesTabProps {
  students: Student[];
  transactions: Transaction[];
  showToast: (msg: string) => void;
  packagePrices: Record<string, number>;
  onPackagePricesChange: (p: Record<string, number>) => void;
}

// Debe coincidir con PACK_LABELS del Studio Manager (src/types.ts): 1, 4, 6, 8, 12, 31
const PACK_LABELS: Record<number, string> = {
  1: 'Paquete 1',
  4: 'Paquete 4',
  6: 'Paquete 6',
  8: 'Paquete 8',
  12: 'Paquete 12',
  31: 'Ilimitado',
  0: 'Sin paquete'
};

const PROGRAMS = [
  'Hatha Yoga',
  'Yoga principiantes',
  'Yoga Terapéutico',
  'Meditación'
];

function expiryDate(s: Student): string {
  if (s.fin) return s.fin;
  if (s.inicio && s.pack && s.pack !== 31) {
    try { return addDays(parseISO(s.inicio), 30).toISOString().slice(0, 10); } catch { /* */ }
  }
  return '';
}

export function getStatusOf(s: Student) {
  if (!s.pack) return "none";

  const fin = expiryDate(s);
  if (fin) {
    const dif = differenceInDays(parseISO(fin), new Date());
    if (dif < 0) return "over";
    if (dif <= 7) return "crit";
    if (dif <= 14) return "warn";
  }

  if (s.pack === 31) return "ok";

  const remaining = Math.max(0, s.pack - (s.fechas?.length || 0));
  if (remaining === 0) return "over";
  if (remaining <= 2) return "crit";
  if (remaining <= 4) return "warn";
  return "ok";
}

export function getExpiryLabel(s: Student) {
  if (!s.pack) return { cls: "bg-warm-200 text-sage-500 border-warm-300", txt: "Sin paquete" };

  const fin = expiryDate(s);
  const daysLeft = fin ? differenceInDays(parseISO(fin), new Date()) : null;
  const dateExpired = daysLeft !== null && daysLeft < 0;

  if (s.pack === 31) {
    if (!s.fin) return { cls: "bg-purple-50 text-purple-700 border-purple-200", txt: "Ilimitado" };
    if (dateExpired) return { cls: "bg-red-50 text-red-600 border-red-200", txt: "Vencido" };
    if (daysLeft === 0) return { cls: "bg-red-50 text-red-600 border-red-200", txt: "Vence hoy" };
    return {
      cls: daysLeft! <= 7 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-purple-50 text-purple-700 border-purple-200",
      txt: `Vence en ${daysLeft}d`
    };
  }

  if (dateExpired) return { cls: "bg-red-50 text-red-600 border-red-200", txt: "Vencido" };

  const remaining = Math.max(0, s.pack - (s.fechas?.length || 0));
  if (remaining === 0) return { cls: "bg-red-50 text-red-600 border-red-200", txt: "Agotado" };

  const txt = daysLeft !== null && daysLeft <= 7
    ? `${remaining} cls · ${daysLeft}d`
    : `${remaining} restantes`;

  return {
    cls: remaining <= 2 || (daysLeft !== null && daysLeft <= 7) ? "bg-red-50 text-red-600 border-red-200" : remaining <= 4 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-green-50 text-green-700 border-green-200",
    txt
  };
}

export default function EstudiantesTab({ students, transactions, showToast, packagePrices, onPackagePricesChange }: EstudiantesTabProps) {
  const [search, setSearch] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Selected student for details modal
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isRenewOpen, setIsRenewOpen] = useState(false);

  // Renewal Form State
  const [newPack, setNewPack] = useState(8);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [recordPayment, setRecordPayment] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState('155000');
  const [paymentMethod, setPaymentMethod] = useState<string>('Efectivo');
  const [savingRenewal, setSavingRenewal] = useState(false);
  const [confirmedRenewal, setConfirmedRenewal] = useState(false);
  const [lastRenewalReceipt, setLastRenewalReceipt] = useState<{ studentName: string; pack: number; amount: number; method: string; date: string } | null>(null);

  // Package prices modal
  const [pricesModal, setPricesModal] = useState(false);
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);

  // Update default price when package changes in renewal form
  useEffect(() => {
    setPaymentAmount((packagePrices[String(newPack)] ?? 0).toString());
  }, [newPack, packagePrices]);

  // Filter students
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
      const matchProg = !programFilter || s.prog === programFilter;
      
      const status = getStatusOf(s);
      let matchStatus = true;
      if (statusFilter) {
        if (statusFilter === 'urgent') {
          matchStatus = ['crit', 'over'].includes(status);
        } else {
          matchStatus = status === statusFilter;
        }
      }
      
      return matchSearch && matchProg && matchStatus;
    }).sort((a, b) => {
      // Sort by urgency first: over, crit, warn, ok, none
      const order: Record<string, number> = { over: 0, crit: 1, warn: 2, ok: 3, none: 4 };
      const statusA = getStatusOf(a);
      const statusB = getStatusOf(b);
      return (order[statusA] ?? 4) - (order[statusB] ?? 4) || a.name.localeCompare(b.name);
    });
  }, [students, search, programFilter, statusFilter]);

  // Student specific transactions (payment history)
  const studentTransactions = useMemo(() => {
    if (!selectedStudent) return [];
    return transactions.filter(t => {
      const isRef = t.refId === selectedStudent.id;
      const isClassCategory = t.category === 'Clases';
      const nameInDesc = t.description.toLowerCase().includes(selectedStudent.name.toLowerCase());
      return isRef || (isClassCategory && nameInDesc);
    }).sort((a, b) => {
      const dateA = typeof a.date === 'string' ? new Date(a.date).getTime() : (a.date as any).seconds * 1000;
      const dateB = typeof b.date === 'string' ? new Date(b.date).getTime() : (b.date as any).seconds * 1000;
      return dateB - dateA; // Newest first
    });
  }, [selectedStudent, transactions]);

  const handleOpenDetail = (student: Student) => {
    setSelectedStudent(student);
    setIsDetailOpen(true);
  };

  const handleOpenRenew = (student: Student) => {
    setSelectedStudent(student);
    setNewPack(student.pack || 8);
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setConfirmedRenewal(false);
    setIsRenewOpen(true);
  };

  const handleProcessRenewal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    
    if (!confirmedRenewal) {
      setConfirmedRenewal(true);
      return;
    }

    setSavingRenewal(true);
    try {
      const clasesToArchive = selectedStudent.fechas?.length || 0;
      
      const updateData: Record<string, any> = {
        pack: newPack,
        inicio: startDate,
        fechas: [], // Reset active sessions count
      };

      // Archive previous dates to history
      if (clasesToArchive > 0 && selectedStudent.fechas) {
        updateData.historialFechas = arrayUnion(...selectedStudent.fechas);
        updateData.renovaciones = arrayUnion({
          fecha: new Date().toISOString().split('T')[0],
          packAnterior: selectedStudent.pack,
          clasesArchivadas: clasesToArchive,
          packNuevo: newPack
        });
      }

      // Vigencia: ilimitado usa fecha manual, los demás 30 días automáticos
      if (newPack === 31) {
        updateData.fin = endDate || format(addDays(parseISO(startDate), 30), 'yyyy-MM-dd');
      } else {
        updateData.fin = format(addDays(parseISO(startDate), 30), 'yyyy-MM-dd');
      }

      // 1. Update Student doc in Firestore
      await updateDoc(doc(db, 'students', selectedStudent.id), updateData);

      // 2. Register payment transaction in Ledger
      if (recordPayment && Number(paymentAmount) > 0) {
        await addDoc(collection(db, 'transactions'), {
          date: startDate,
          type: 'ingreso',
          amount: Number(paymentAmount),
          method: paymentMethod,
          category: 'Clases',
          description: `Renovación Paquete: ${PACK_LABELS[newPack] || 'Sin paquete'} - ${selectedStudent.name}`,
          refId: selectedStudent.id,
          createdBy: auth.currentUser?.email || 'Admin',
          createdAt: serverTimestamp()
        });
      }

      if (recordPayment && Number(paymentAmount) > 0) {
        setLastRenewalReceipt({
          studentName: selectedStudent.name,
          pack: newPack,
          amount: Number(paymentAmount),
          method: paymentMethod,
          date: startDate,
        });
      }
      showToast(`Membresía de ${selectedStudent.name} renovada con éxito.`);
      setIsRenewOpen(false);
      
      // Refresh selected student ref to update details if open
      const updatedStudent = {
        ...selectedStudent,
        pack: newPack,
        inicio: startDate,
        fin: newPack === 31 ? endDate : '',
        fechas: []
      };
      setSelectedStudent(updatedStudent);
    } catch (err) {
      console.error(err);
      showToast("Error al renovar la membresía.");
    } finally {
      setSavingRenewal(false);
    }
  };

  const handleSavePrices = async () => {
    setSavingPrices(true);
    try {
      const newPrices: Record<string, number> = {};
      Object.entries(editingPrices).forEach(([k, v]) => { newPrices[k] = Number(v) || 0; });
      await setDoc(doc(db, 'config', 'packagePrices'), newPrices);
      onPackagePricesChange(newPrices);
      setPricesModal(false);
      showToast("Precios actualizados.");
    } catch { showToast("Error al guardar los precios."); }
    finally { setSavingPrices(false); }
  };

  const handleOpenRenewalReceipt = () => {
    if (!lastRenewalReceipt) return;
    openReceipt({
      docNumber: `MBR-${Date.now().toString(36).toUpperCase()}`,
      date: lastRenewalReceipt.date,
      seller: auth.currentUser?.email?.replace('@demo-yoga.app', '') ?? 'Admin',
      customer: lastRenewalReceipt.studentName,
      items: [{ name: `${PACK_LABELS[lastRenewalReceipt.pack] ?? 'Paquete'} · Membresía Bhumi Yoga`, qty: 1, price: lastRenewalReceipt.amount }],
      total: lastRenewalReceipt.amount,
      paymentMethod: lastRenewalReceipt.method,
    });
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="animate-fadeUp relative overflow-hidden rounded-3xl bg-gradient-to-br from-sage-600/10 via-sage-800/5 to-sage-400/10 border border-white/60 px-6 py-7 md:px-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="orb w-40 h-40 bg-sage-800/15 -right-10 -top-14"></div>
        <div className="relative">
          <h2 className="text-3xl font-bold font-serif text-sage-900">Estudiantes y <span className="text-sage-600">Pagos</span></h2>
          <p className="text-sm text-sage-400 mt-1">Administra membresías, vigencia de paquetes y visualiza el historial de cobros.</p>
        </div>
        <div className="relative bg-white/70 backdrop-blur border border-sage-200 px-4 py-2 rounded-2xl flex items-center gap-3">
          <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></span>
          <span className="text-xs font-bold text-sage-900">
            {students.filter(s => { const st = getStatusOf(s); return st === 'ok' || st === 'warn' || st === 'crit'; }).length} Activos
            <span className="text-sage-400 font-medium"> / {students.length} Total</span>
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-3xl border border-warm-300 shadow-sm flex flex-wrap gap-4 items-center">
        {/* Search */}
        <div className="flex-1 min-w-[240px] relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-300" />
          <input 
            type="text" 
            placeholder="Buscar por nombre..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl focus:ring-2 focus:ring-sage-600/10 outline-none text-sm font-medium"
          />
        </div>

        {/* Program Filter */}
        <div className="relative">
          <select 
            value={programFilter}
            onChange={e => setProgramFilter(e.target.value)}
            className="pl-4 pr-10 py-3 bg-warm-50 border border-warm-300 rounded-2xl appearance-none focus:ring-2 focus:ring-sage-600/10 outline-none text-sm font-medium text-sage-700"
          >
            <option value="">Todos los programas</option>
            {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-400 pointer-events-none" />
        </div>

        {/* Status Filter */}
        <div className="relative">
          <select 
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="pl-4 pr-10 py-3 bg-warm-50 border border-warm-300 rounded-2xl appearance-none focus:ring-2 focus:ring-sage-600/10 outline-none text-sm font-medium text-sage-700"
          >
            <option value="">Todos los estados</option>
            <option value="urgent">Urgente (Crítico / Agotado)</option>
            <option value="warn">Próximo a vencer</option>
            <option value="ok">Al día</option>
            <option value="none">Sin paquete</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-400 pointer-events-none" />
        </div>

        <button
          onClick={() => { setEditingPrices(Object.fromEntries(Object.entries(packagePrices).map(([k,v]) => [k, String(v)]))); setPricesModal(true); }}
          className="flex items-center gap-2 px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl text-sm font-bold text-sage-700 hover:bg-warm-100 transition-all cursor-pointer"
        >
          <DollarSign className="w-4 h-4 text-sage-400" /> Tarifas
        </button>

        {lastRenewalReceipt && (
          <button
            onClick={handleOpenRenewalReceipt}
            className="flex items-center gap-2 px-4 py-3 border border-sage-400 rounded-2xl text-sm font-bold text-sage-700 hover:bg-sage-50 transition-all cursor-pointer"
          >
            <Receipt className="w-4 h-4" /> Última Colilla
          </button>
        )}
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-3xl border border-warm-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-warm-200 text-sage-900 border-b border-warm-300 text-xs uppercase tracking-wider font-bold">
                <th className="px-6 py-4">Estudiante</th>
                <th className="px-6 py-4">Programa</th>
                <th className="px-6 py-4">Paquete Activo</th>
                <th className="px-6 py-4">Progreso Clases</th>
                <th className="px-6 py-4">Estado Membresía</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200 text-sage-900">
              {filteredStudents.map(student => {
                const status = getStatusOf(student);
                const expiry = getExpiryLabel(student);
                
                // Progress calculations
                const taken = student.fechas?.length || 0;
                const total = student.pack || 0;
                const percentage = total > 0 && total !== 31 ? Math.min(100, (taken / total) * 100) : 0;
                
                return (
                  <tr key={student.id} className="hover:bg-warm-100/50 transition-colors">
                    {/* Name */}
                    <td className="px-6 py-4 font-bold text-sage-900 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-sage-100 text-sage-600 flex items-center justify-center font-serif text-xs font-bold border border-sage-200">
                          {student.name.substring(0,2).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span>{student.name}</span>
                          {student.nota && <span className="text-[10px] text-orange font-bold uppercase tracking-wider">{student.nota}</span>}
                        </div>
                      </div>
                    </td>

                    {/* Program */}
                    <td className="px-6 py-4 whitespace-nowrap text-sage-500 font-medium">
                      {student.prog}
                    </td>

                    {/* Package */}
                    <td className="px-6 py-4 whitespace-nowrap font-semibold">
                      {PACK_LABELS[student.pack] || 'Sin paquete'}
                    </td>

                    {/* Progress */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {student.pack > 0 && student.pack !== 31 ? (
                        <div className="flex items-center gap-3 min-w-[120px]">
                          <div className="w-24 bg-warm-200 h-2.5 rounded-full overflow-hidden border border-warm-300">
                            <div 
                              className={`h-full transition-all duration-300 ${status === 'over' ? 'bg-red-500' : status === 'crit' ? 'bg-orange-400' : 'bg-green-600'}`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold">{taken} / {total}</span>
                        </div>
                      ) : student.pack === 31 ? (
                        <span className="text-xs text-purple-600 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-100">Ilimitado</span>
                      ) : (
                        <span className="text-xs text-sage-400 italic">No aplica</span>
                      )}
                    </td>

                    {/* Expiry Badge */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${expiry.cls}`}>
                        {expiry.txt}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenDetail(student)}
                          className="px-3 py-1.5 text-xs font-bold border border-warm-300 text-sage-600 rounded-xl hover:bg-warm-100 transition-all cursor-pointer"
                        >
                          Ver Ficha
                        </button>
                        <button
                          onClick={() => handleOpenRenew(student)}
                          className="bg-sage-600 hover:bg-sage-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-md transition-all active:scale-[0.98] cursor-pointer"
                        >
                          Renovar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sage-400 italic">
                    <User className="w-12 h-12 text-warm-200 mx-auto mb-2" />
                    No se encontraron estudiantes para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* STUDENT DETAIL MODAL */}
      <Modal 
        isOpen={isDetailOpen} 
        onClose={() => setIsDetailOpen(false)} 
        title="Ficha del Estudiante"
      >
        {selectedStudent && (
          <div className="space-y-6">
            {/* Top Student Banner */}
            <div className="bg-warm-50 border border-warm-200 rounded-2xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-sage-900 text-white flex items-center justify-center font-serif text-lg font-bold">
                {selectedStudent.name.substring(0,2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-base text-sage-900 truncate leading-tight">{selectedStudent.name}</h4>
                <p className="text-xs text-sage-500 italic mt-0.5">{selectedStudent.prog}</p>
              </div>
              <button 
                onClick={() => { setIsDetailOpen(false); handleOpenRenew(selectedStudent); }}
                className="bg-sage-600 hover:bg-sage-700 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Renovar
              </button>
            </div>

            {/* General Info Grid */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="bg-warm-50 p-3 rounded-xl border border-warm-200">
                <span className="font-semibold text-sage-400 uppercase tracking-wider block text-[9px] mb-1">Paquete Activo</span>
                <span className="font-bold text-sage-900 text-sm">{PACK_LABELS[selectedStudent.pack] || 'Sin paquete'}</span>
              </div>
              <div className="bg-warm-50 p-3 rounded-xl border border-warm-200">
                <span className="font-semibold text-sage-400 uppercase tracking-wider block text-[9px] mb-1">Vigencia</span>
                <span className="font-bold text-sage-900 text-sm">
                  {selectedStudent.inicio ? formatDate(selectedStudent.inicio) : '—'}
                  {selectedStudent.fin ? ` al ${formatDate(selectedStudent.fin)}` : ''}
                </span>
              </div>
            </div>

            {selectedStudent.nota && (
              <div className="bg-orange/5 border border-orange/20 rounded-xl p-3 text-xs text-orange">
                <span className="font-extrabold uppercase tracking-widest text-[9px] block mb-1">Notas / Alertas</span>
                <p className="font-semibold">{selectedStudent.nota}</p>
              </div>
            )}

            {/* Billing / Payment History */}
            <div className="space-y-3">
              <h5 className="font-bold text-sm text-sage-900 font-serif flex items-center gap-2 border-b border-warm-200 pb-2">
                <CreditCard className="w-4 h-4 text-sage-600" />
                Historial de Cobros y Transacciones (ERP)
              </h5>
              
              <div className="max-h-[220px] overflow-y-auto pr-1 space-y-2">
                {studentTransactions.map(t => (
                  <div key={t.id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-warm-300 text-xs hover:shadow-sm transition-all">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-sage-300" />
                        <span className="font-bold text-sage-900">{formatDate(t.date)}</span>
                        <span className="bg-sage-100 text-sage-800 text-[9px] font-bold px-1.5 py-0.5 rounded border border-sage-200">
                          {t.method}
                        </span>
                      </div>
                      <p className="text-[10px] text-sage-500 mt-1 font-medium leading-relaxed max-w-[280px]">
                        {t.description}
                      </p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <span className="text-green-600 font-extrabold font-serif text-sm">
                        + {formatCurrency(t.amount)}
                      </span>
                      <span className="text-[9px] text-sage-400 font-normal">Por: {t.createdBy}</span>
                    </div>
                  </div>
                ))}

                {studentTransactions.length === 0 && (
                  <p className="text-center text-sage-400 italic text-xs py-8 bg-warm-50 rounded-xl border border-dashed border-warm-300">
                    No se registran pagos en el libro contable de este estudiante.
                  </p>
                )}
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="px-6 py-2.5 bg-warm-200 text-sage-600 rounded-xl text-xs font-bold hover:bg-warm-300 transition-all cursor-pointer"
              >
                Cerrar Ficha
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* RENEWAL MODAL */}
      <Modal 
        isOpen={isRenewOpen} 
        onClose={() => setIsRenewOpen(false)} 
        title="Renovar Membresía"
      >
        {selectedStudent && (
          <form onSubmit={handleProcessRenewal} className="space-y-4">
            {/* Student Info */}
            <div className="bg-warm-50 border border-warm-200 rounded-xl p-3 text-xs space-y-1">
              <span className="text-[9px] text-sage-400 font-bold uppercase tracking-wider block">Estudiante</span>
              <p className="font-bold text-sage-900">{selectedStudent.name}</p>
              <p className="text-sage-500">{selectedStudent.prog} · Paquete Actual: {PACK_LABELS[selectedStudent.pack] || 'Sin paquete'}</p>
            </div>

            {/* Pack Select */}
            <div>
              <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Nuevo Paquete</label>
              <select
                value={newPack}
                onChange={e => { setNewPack(parseInt(e.target.value)); setConfirmedRenewal(false); }}
                className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10 font-medium text-sage-900"
              >
                {Object.entries(PACK_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Fecha Inicio</label>
                <input 
                  type="date" 
                  required
                  value={startDate}
                  onChange={e => { setStartDate(e.target.value); setConfirmedRenewal(false); }}
                  className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10 text-xs font-bold text-sage-900"
                />
              </div>
              {newPack === 31 && (
                <div>
                  <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Vencimiento</label>
                  <input 
                    type="date" 
                    required
                    value={endDate}
                    onChange={e => { setEndDate(e.target.value); setConfirmedRenewal(false); }}
                    className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10 text-xs font-bold text-sage-900"
                  />
                </div>
              )}
            </div>

            {/* Payment Integration */}
            <div className="bg-sage-50 border border-sage-200 rounded-2xl p-4 space-y-4">
              <label className="flex items-center gap-2.5 text-xs font-bold text-sage-900 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={recordPayment}
                  onChange={e => setRecordPayment(e.target.checked)}
                  className="rounded border-warm-300 text-sage-600 focus:ring-sage-600/10 w-4 h-4"
                />
                <span>Registrar cobro en Libro Contable (ERP)</span>
              </label>

              {recordPayment && (
                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-[9px] font-bold text-sage-500 uppercase tracking-wider mb-1.5">Monto Recibido (COP)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-sage-400">$</span>
                      <input 
                        type="number"
                        required
                        min="0"
                        value={paymentAmount}
                        onChange={e => setPaymentAmount(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 bg-white border border-warm-300 rounded-xl outline-none text-xs font-bold text-sage-900"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-sage-500 uppercase tracking-wider mb-1.5">Medio de Pago</label>
                    <select
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-warm-300 rounded-xl outline-none text-xs font-bold text-sage-900"
                    >
                      <option value="Efectivo">Efectivo</option>
                      <option value="Nubank">Nubank</option>
                      <option value="Bancolombia">Bancolombia</option>
                      <option value="Daviplata">Daviplata</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Confirmation Alert */}
            {confirmedRenewal && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-amber-800 font-medium leading-relaxed">
                  ¿Seguro que deseas renovar el paquete de clases de <strong>{selectedStudent.name}</strong>?<br />
                  Se archivarán sus asistencias actuales y el contador iniciará en cero.
                </p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 justify-end pt-4 border-t border-warm-200">
              <button
                type="button"
                onClick={() => setIsRenewOpen(false)}
                className="px-5 py-3 border border-warm-300 rounded-xl text-xs font-bold text-sage-600 hover:bg-warm-100 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingRenewal}
                className={`px-8 py-3 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer text-white ${confirmedRenewal ? 'bg-green-600 hover:bg-green-700 shadow-green-600/10' : 'bg-sage-900 hover:bg-black shadow-sage-900/10'}`}
              >
                {savingRenewal ? (
                  'Guardando...'
                ) : confirmedRenewal ? (
                  <><CheckCircle2 className="w-4 h-4" /> Confirmar Cobro</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> Registrar Renovación</>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* PACKAGE PRICES MODAL */}
      <Modal isOpen={pricesModal} onClose={() => setPricesModal(false)} title="Tarifas de Paquetes">
        <div className="space-y-4">
          <p className="text-sm text-sage-500 leading-relaxed">
            Estos precios se usan como referencia al renovar membresías. Actualiza cuando cambien las tarifas.
          </p>
          <div className="space-y-3">
            {Object.entries(PACK_LABELS).filter(([k]) => k !== '0').map(([key, label]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs font-bold text-sage-700 w-28 shrink-0">{label}</span>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-sage-400">$</span>
                  <input
                    type="number"
                    min="0"
                    value={editingPrices[key] ?? ''}
                    onChange={e => setEditingPrices(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder="0"
                    className="w-full pl-7 pr-3 py-2.5 bg-warm-50 border border-warm-300 rounded-xl outline-none focus:ring-2 focus:ring-sage-600/10 text-xs font-bold"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setPricesModal(false)}
              className="px-6 py-3 border border-warm-300 rounded-xl text-sm font-bold text-sage-600 hover:bg-warm-100 transition-all cursor-pointer">
              Cancelar
            </button>
            <button onClick={handleSavePrices} disabled={savingPrices}
              className="bg-sage-600 hover:bg-sage-700 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-2">
              <Save className="w-4 h-4" />
              {savingPrices ? 'Guardando...' : 'Guardar Tarifas'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
