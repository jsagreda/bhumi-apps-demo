import React, { useState, useMemo } from 'react';
import { BhumiEvent, Transaction, Student, CashReconciliation } from '../types';
import { formatCurrency, formatDate } from '../lib/utils';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, increment } from 'firebase/firestore';
import { Calendar, AlertTriangle, Plus, ClipboardCheck, CheckCircle2, XCircle, Banknote, History } from 'lucide-react';
import Modal from '../components/Modal';

interface EventosTabProps {
  events: BhumiEvent[];
  students: Student[];
  transactions: Transaction[];
  reconciliations: CashReconciliation[];
  showToast: (msg: string) => void;
}

export default function EventosTab({ events, students, transactions, reconciliations, showToast }: EventosTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'eventos' | 'arqueo'>('eventos');
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Medio de pago con que se cobran las inscripciones a eventos
  const [evtPayMethod, setEvtPayMethod] = useState<'Nubank' | 'Bancolombia' | 'Daviplata' | 'Efectivo'>('Efectivo');

  // Event form state
  const [evtName, setEvtName] = useState('');
  const [evtDate, setEvtDate] = useState(new Date().toISOString().split('T')[0]);
  const [evtPrice, setEvtPrice] = useState('');
  const [evtCapacity, setEvtCapacity] = useState('15');

  // Arqueo (Cash drawer count) state
  const [arqueoMode, setArqueoMode] = useState<'rapido' | 'detallado'>('rapido');
  const [quickTotal, setQuickTotal] = useState('');
  const [arqueoDate, setArqueoDate] = useState(new Date().toISOString().split('T')[0]);
  const [denomCount, setDenomCount] = useState<Record<string, string>>({
    '100000': '0',
    '50000': '0',
    '20000': '0',
    '10000': '0',
    '5000': '0',
    '2000': '0',
    '1000': '0',
    'monedas': '0'
  });
  const [arqueoNotes, setArqueoNotes] = useState('');

  // Calculate expected cash balance in ledger (Sum of all Cash Ingresos - Sum of all Cash Egresos)
  const expectedCashBalance = useMemo(() => {
    let bal = 0;
    transactions.forEach(t => {
      if (t.method === 'Efectivo') {
        const amt = Number(t.amount) || 0;
        if (t.type === 'ingreso') bal += amt;
        else bal -= amt;
      }
    });
    return bal;
  }, [transactions]);

  const physicalCashSum = useMemo(() => {
    if (arqueoMode === 'rapido') return Number(quickTotal) || 0;
    let sum = 0;
    Object.entries(denomCount).forEach(([denom, qtyStr]) => {
      const qty = Number(qtyStr) || 0;
      if (denom === 'monedas') sum += qty;
      else sum += Number(denom) * qty;
    });
    return sum;
  }, [denomCount, quickTotal, arqueoMode]);

  const cashDifference = useMemo(() => {
    return physicalCashSum - expectedCashBalance;
  }, [physicalCashSum, expectedCashBalance]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evtName.trim() || !evtPrice || !evtCapacity) {
      showToast("Completa todos los campos obligatorios.");
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, 'events'), {
        name: evtName.trim(),
        date: evtDate,
        price: Number(evtPrice),
        capacity: Number(evtCapacity),
        registeredStudents: [],
        expenses: 0,
        status: 'activo',
        createdAt: serverTimestamp()
      });

      showToast("Taller/Evento creado con éxito.");
      setEventModalOpen(false);
      setEvtName('');
      setEvtPrice('');
    } catch (err) {
      console.error(err);
      showToast("Error al crear el evento.");
    } finally {
      setSaving(false);
    }
  };

  const handleRegisterStudentToEvent = async (eventId: string, studentName: string, price: number) => {
    if (!studentName) return;
    const event = events.find(e => e.id === eventId);
    if (!event) return;

    if (event.registeredStudents.length >= event.capacity) {
      showToast("Cupos agotados para este evento.");
      return;
    }

    setSaving(true);
    try {
      // 1. Update event participants list
      const updatedList = [...event.registeredStudents, studentName];
      await updateDoc(doc(db, 'events', event.id), {
        registeredStudents: updatedList
      });

      // 2. Register income transaction in ledger
      await addDoc(collection(db, 'transactions'), {
        date: new Date().toISOString().split('T')[0],
        type: 'ingreso',
        amount: price,
        method: evtPayMethod,
        category: 'Eventos',
        description: `Inscripción Evento: ${event.name} - ${studentName}`,
        refId: event.id,
        createdBy: auth.currentUser?.email || 'Admin',
        createdAt: serverTimestamp()
      });

      showToast(`Estudiante inscrito en ${event.name}.`);
    } catch (err) {
      console.error(err);
      showToast("Error al inscribir estudiante.");
    } finally {
      setSaving(false);
    }
  };

  // ── Ciclo de vida del evento ──
  const handleChangeEventStatus = async (evt: BhumiEvent, status: 'completado' | 'cancelado') => {
    if (!window.confirm(`¿Marcar el evento "${evt.name}" como ${status}?`)) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'events', evt.id), { status });
      showToast(`Evento marcado como ${status}.`);
    } catch (err) {
      console.error(err);
      showToast("Error al actualizar el estado del evento.");
    } finally {
      setSaving(false);
    }
  };

  // ── Gastos del evento ──
  const [expenseModalEvent, setExpenseModalEvent] = useState<BhumiEvent | null>(null);
  const [expAmount, setExpAmount] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [expMethod, setExpMethod] = useState<'Nubank' | 'Bancolombia' | 'Daviplata' | 'Efectivo'>('Efectivo');

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseModalEvent || !expAmount || Number(expAmount) <= 0 || !expDescription.trim()) {
      showToast("Completa el monto y la descripción del gasto.");
      return;
    }
    setSaving(true);
    try {
      // 1. Acumular el gasto en el evento
      await updateDoc(doc(db, 'events', expenseModalEvent.id), {
        expenses: increment(Number(expAmount))
      });
      // 2. Registrar el egreso en el libro contable
      await addDoc(collection(db, 'transactions'), {
        date: new Date().toISOString().split('T')[0],
        type: 'egreso',
        amount: Number(expAmount),
        method: expMethod,
        category: 'Eventos',
        description: `Gasto Evento: ${expenseModalEvent.name} - ${expDescription.trim()}`,
        refId: expenseModalEvent.id,
        createdBy: auth.currentUser?.email || 'Admin',
        createdAt: serverTimestamp()
      });
      showToast("Gasto del evento registrado.");
      setExpenseModalEvent(null);
      setExpAmount('');
      setExpDescription('');
    } catch (err) {
      console.error(err);
      showToast("Error al registrar el gasto.");
    } finally {
      setSaving(false);
    }
  };

  const handleDenomChange = (denom: string, val: string) => {
    setDenomCount(prev => ({
      ...prev,
      [denom]: val
    }));
  };

  const handleSaveArqueo = async () => {
    setSaving(true);
    try {
      const counts: Record<string, number> = {};
      if (arqueoMode === 'detallado') {
        Object.entries(denomCount).forEach(([k, v]) => { counts[k] = Number(v) || 0; });
      }

      await addDoc(collection(db, 'cashReconciliations'), {
        date: arqueoDate,
        mode: arqueoMode,
        denomCount: arqueoMode === 'detallado' ? counts : null,
        totalExpected: expectedCashBalance,
        totalPhysical: physicalCashSum,
        difference: cashDifference,
        reconciledBy: auth.currentUser?.email || 'Admin',
        notes: arqueoNotes.trim(),
        createdAt: serverTimestamp(),
      });

      showToast("Arqueo registrado con éxito.");
      setArqueoNotes('');
      setQuickTotal('');
      setDenomCount({
        '100000': '0', '50000': '0', '20000': '0', '10000': '0',
        '5000': '0', '2000': '0', '1000': '0', 'monedas': '0'
      });
    } catch (err) {
      console.error(err);
      showToast("Error al guardar arqueo de caja.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Subnavigation Tab */}
      <div className="flex justify-between items-center border-b border-warm-200 pb-2">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveSubTab('eventos')}
            className={`pb-2.5 font-bold text-sm tracking-wide transition-all border-b-2 cursor-pointer ${activeSubTab === 'eventos' ? 'text-sage-900 border-sage-600 font-extrabold' : 'text-sage-400 border-transparent hover:text-sage-600'}`}
          >
            Gestión de Eventos & Talleres
          </button>
          <button
            onClick={() => setActiveSubTab('arqueo')}
            className={`pb-2.5 font-bold text-sm tracking-wide transition-all border-b-2 cursor-pointer ${activeSubTab === 'arqueo' ? 'text-sage-900 border-sage-600 font-extrabold' : 'text-sage-400 border-transparent hover:text-sage-600'}`}
          >
            Arqueo de Caja Chica
          </button>
        </div>

        {activeSubTab === 'eventos' && (
          <button
            onClick={() => setEventModalOpen(true)}
            className="bg-sage-600 hover:bg-sage-700 text-white px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all text-xs font-bold shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Crear Taller / Evento
          </button>
        )}
      </div>

      {/* EVENTS MANAGEMENT TAB */}
      {activeSubTab === 'eventos' && (
        <>
        {events.length > 0 && (
          <div className="bg-white p-4 rounded-2xl border border-warm-300 shadow-sm flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs font-medium text-sage-700">
              Medio de pago con el que se registran las inscripciones:
            </p>
            <select
              value={evtPayMethod}
              onChange={e => setEvtPayMethod(e.target.value as any)}
              className="px-4 py-2 text-xs bg-warm-100 border border-warm-300 rounded-xl outline-none font-bold"
            >
              <option value="Efectivo">Efectivo</option>
              <option value="Nubank">Nubank</option>
              <option value="Bancolombia">Bancolombia</option>
              <option value="Daviplata">Daviplata</option>
            </select>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {events.map(evt => {
            const currentReg = evt.registeredStudents?.length || 0;
            const remains = evt.capacity - currentReg;
            
            const ingresoEvento = currentReg * evt.price;
            const gastoEvento = Number(evt.expenses) || 0;
            const utilidad = ingresoEvento - gastoEvento;
            const isActivo = evt.status === 'activo';
            const pctOcupacion = evt.capacity > 0 ? Math.min(100, Math.round((currentReg / evt.capacity) * 100)) : 0;

            return (
              <div key={evt.id} className="card-lift animate-fadeUp bg-white p-5 rounded-3xl border border-warm-300 shadow-sm flex flex-col justify-between min-h-[260px] relative overflow-hidden">
                {!isActivo && <div className={`absolute left-0 top-0 bottom-0 w-1 ${evt.status === 'completado' ? 'bg-green-400' : 'bg-red-300'}`}></div>}
                <div>
                  <div className="flex justify-between items-start gap-2 border-b border-warm-100 pb-2.5 mb-3">
                    <h4 className="font-bold text-sm text-sage-900 font-serif leading-tight">{evt.name}</h4>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${evt.status === 'activo' ? 'bg-green-50 text-green-700' : evt.status === 'completado' ? 'bg-sage-100 text-sage-900' : 'bg-red-50 text-red-500'}`}>
                      {evt.status}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-sage-500">
                    <p>Fecha: <span className="font-semibold text-sage-900">{evt.date}</span></p>
                    <p>Costo inscripción: <span className="font-bold text-sage-900">{formatCurrency(evt.price)}</span></p>
                  </div>

                  {/* Ocupación */}
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-sage-400">
                      <span>{currentReg}/{evt.capacity} INSCRITOS</span>
                      <span className={remains <= 2 && isActivo ? 'text-red-500' : ''}>{remains} libres</span>
                    </div>
                    <div className="h-1.5 w-full bg-warm-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-sage-600 to-sage-800 rounded-full relative overflow-hidden transition-all duration-700"
                        style={{ width: `${pctOcupacion}%` }}
                      >
                        {pctOcupacion > 0 && pctOcupacion < 100 && <div className="bar-shine"></div>}
                      </div>
                    </div>
                  </div>

                  {/* P&L del evento */}
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="bg-warm-100 rounded-xl py-1.5">
                      <span className="text-[8px] text-sage-400 font-bold uppercase tracking-wider block">Ingresos</span>
                      <span className="text-[11px] font-extrabold text-green-600">{formatCurrency(ingresoEvento)}</span>
                    </div>
                    <div className="bg-warm-100 rounded-xl py-1.5">
                      <span className="text-[8px] text-sage-400 font-bold uppercase tracking-wider block">Gastos</span>
                      <span className="text-[11px] font-extrabold text-red-500">{formatCurrency(gastoEvento)}</span>
                    </div>
                    <div className="bg-warm-100 rounded-xl py-1.5">
                      <span className="text-[8px] text-sage-400 font-bold uppercase tracking-wider block">Utilidad</span>
                      <span className={`text-[11px] font-extrabold ${utilidad >= 0 ? 'text-sage-900' : 'text-red-500'}`}>{formatCurrency(utilidad)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-warm-100 mt-3 space-y-2">
                  {isActivo && (
                    <select
                      onChange={e => {
                        if (e.target.value) {
                          handleRegisterStudentToEvent(evt.id, e.target.value, evt.price);
                          e.target.value = ''; // Reset
                        }
                      }}
                      className="w-full px-3 py-2 text-xs bg-warm-100 border border-warm-300 rounded-xl outline-none font-medium text-sage-700"
                    >
                      <option value="">-- Registrar Estudiante --</option>
                      {students.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  )}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => { setExpenseModalEvent(evt); setExpAmount(''); setExpDescription(''); }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-bold border border-warm-300 text-sage-600 rounded-xl hover:bg-warm-100 transition-all cursor-pointer"
                    >
                      <Banknote className="w-3.5 h-3.5" /> Gasto
                    </button>
                    {isActivo && (
                      <>
                        <button
                          onClick={() => handleChangeEventStatus(evt, 'completado')}
                          disabled={saving}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-bold border border-green-200 text-green-700 rounded-xl hover:bg-green-50 transition-all cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Completar
                        </button>
                        <button
                          onClick={() => handleChangeEventStatus(evt, 'cancelado')}
                          disabled={saving}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-bold border border-red-200 text-red-500 rounded-xl hover:bg-red-50 transition-all cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {events.length === 0 && (
            <div className="col-span-full py-16 text-center text-sage-400 italic bg-white rounded-3xl border border-dashed border-warm-300">
              <Calendar className="w-12 h-12 text-warm-200 mx-auto mb-2" />
              No hay eventos o talleres especiales programados.
            </div>
          )}
        </div>
        </>
      )}

      {/* CASH DRAWER AUDIT TAB */}
      {activeSubTab === 'arqueo' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Calculadora Fiel */}
          <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-warm-300 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-warm-100 pb-3">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-sage-600" />
                <h3 className="font-bold text-sage-900 font-serif">Arqueo de Efectivo</h3>
              </div>
              <div className="flex gap-1 bg-warm-100 p-0.5 rounded-xl">
                <button
                  onClick={() => setArqueoMode('rapido')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${arqueoMode === 'rapido' ? 'bg-white text-sage-900 shadow-sm' : 'text-sage-500'}`}
                >
                  Rápido
                </button>
                <button
                  onClick={() => setArqueoMode('detallado')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${arqueoMode === 'detallado' ? 'bg-white text-sage-900 shadow-sm' : 'text-sage-500'}`}
                >
                  Por billetes
                </button>
              </div>
            </div>

            <p className="text-xs text-sage-400 leading-relaxed -mt-2">
              Cuenta el efectivo de la caja cuando lo necesites (semanal, quincenal o espontáneo) y compara contra lo que el libro contable espera.
            </p>

            {/* Fecha del arqueo */}
            <div>
              <label className="block text-[10px] font-bold text-sage-400 uppercase tracking-wider mb-1.5">Fecha del conteo</label>
              <input type="date" value={arqueoDate} onChange={e => setArqueoDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-warm-50 border border-warm-300 rounded-xl outline-none focus:ring-2 focus:ring-sage-600/10 text-xs font-bold" />
            </div>

            {/* Modo rápido: solo monto total */}
            {arqueoMode === 'rapido' && (
              <div>
                <label className="block text-[10px] font-bold text-sage-400 uppercase tracking-wider mb-1.5">Total contado en caja (COP)</label>
                <input
                  type="number" min="0"
                  value={quickTotal}
                  onChange={e => setQuickTotal(e.target.value)}
                  placeholder="Ej. 450000"
                  className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10 text-base font-bold"
                />
              </div>
            )}

            {/* Modo detallado: por denominación */}
            {arqueoMode === 'detallado' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: '$100.000', key: '100000', multiply: 100000 },
                  { label: '$50.000', key: '50000', multiply: 50000 },
                  { label: '$20.000', key: '20000', multiply: 20000 },
                  { label: '$10.000', key: '10000', multiply: 10000 },
                  { label: '$5.000', key: '5000', multiply: 5000 },
                  { label: '$2.000', key: '2000', multiply: 2000 },
                  { label: '$1.000', key: '1000', multiply: 1000 },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between gap-3 p-2 bg-warm-100 rounded-xl border border-warm-200">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-sage-900">{item.label}</span>
                      <span className="text-[10px] text-sage-400">= {formatCurrency(item.multiply * (Number(denomCount[item.key]) || 0))}</span>
                    </div>
                    <input
                      type="number" min="0" placeholder="0"
                      value={denomCount[item.key]}
                      onChange={e => handleDenomChange(item.key, e.target.value)}
                      className="w-16 px-2.5 py-1 text-center bg-white border border-warm-300 rounded-lg outline-none font-bold text-xs"
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 p-2 bg-warm-100 rounded-xl border border-warm-200 col-span-full">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-sage-900">Monedas (total)</span>
                    <span className="text-[10px] text-sage-400">Valor sumado de todas las monedas</span>
                  </div>
                  <input
                    type="number" min="0" placeholder="COP"
                    value={denomCount['monedas']}
                    onChange={e => handleDenomChange('monedas', e.target.value)}
                    className="w-28 px-2.5 py-1 text-right bg-white border border-warm-300 rounded-lg outline-none font-bold text-xs"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Observaciones (opcional)</label>
              <textarea
                rows={2}
                value={arqueoNotes}
                onChange={e => setArqueoNotes(e.target.value)}
                placeholder="Ej. Vueltos pendientes, caja cuadrada, etc."
                className="w-full px-4 py-2.5 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10 text-xs"
              />
            </div>
          </div>

          {/* Reporte de Cuadrado */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white p-6 rounded-3xl border border-warm-300 shadow-sm space-y-6 flex flex-col justify-between min-h-[380px]">
              <div>
                <div className="flex items-center gap-2 border-b border-warm-200 pb-3 mb-4">
                  <ClipboardCheck className="w-5 h-5 text-sage-600" />
                  <h3 className="font-bold text-sage-900 font-serif">Balance de Arqueo</h3>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-warm-100">
                    <span className="text-xs text-sage-500 font-medium">Efectivo esperado en Ledger:</span>
                    <span className="text-sm font-bold text-sage-900">{formatCurrency(expectedCashBalance)}</span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-warm-100">
                    <span className="text-xs text-sage-500 font-medium">Total físico contado:</span>
                    <span className="text-sm font-bold text-sage-900">{formatCurrency(physicalCashSum)}</span>
                  </div>

                  <div className="flex justify-between items-center py-3 border-b border-warm-100">
                    <span className="text-xs text-sage-500 font-medium">Diferencia:</span>
                    <span className={`text-base font-extrabold ${cashDifference === 0 ? 'text-sage-900' : cashDifference > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {cashDifference === 0 ? 'Cuadrado' : formatCurrency(cashDifference)}
                    </span>
                  </div>
                </div>

                {cashDifference !== 0 && (
                  <div className={`mt-4 p-3.5 rounded-xl border flex gap-2.5 ${cashDifference > 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="text-[10px] leading-relaxed">
                      {cashDifference > 0 
                        ? 'Se detecta un superávit en caja física. Verifica si alguna venta o ingreso de efectivo no fue registrado en el libro contable.' 
                        : 'Se detecta un faltante en caja física. Asegúrate de registrar todos los gastos y salidas rápidas de caja menor.'}
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-warm-200">
                <button
                  onClick={handleSaveArqueo}
                  disabled={saving || physicalCashSum === 0}
                  className="w-full bg-sage-900 hover:bg-black text-white py-3 rounded-2xl text-xs font-bold tracking-widest uppercase transition-all shadow-md active:scale-95 disabled:opacity-40 cursor-pointer"
                >
                  {saving ? 'Registrando...' : 'Registrar Arqueo / Conciliación'}
                </button>
              </div>
            </div>

            {/* Historial de arqueos */}
            <div className="bg-white p-5 rounded-3xl border border-warm-300 shadow-sm">
              <div className="flex items-center gap-2 border-b border-warm-100 pb-3 mb-3">
                <History className="w-4 h-4 text-sage-600" />
                <h3 className="font-bold text-sage-900 text-sm">Arqueos Anteriores</h3>
              </div>
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {[...reconciliations]
                  .sort((a, b) => {
                    const dA = typeof a.date === 'string' ? new Date(a.date).getTime() : ((a.date as any)?.seconds || 0) * 1000;
                    const dB = typeof b.date === 'string' ? new Date(b.date).getTime() : ((b.date as any)?.seconds || 0) * 1000;
                    return dB - dA;
                  })
                  .map(rec => (
                    <div key={rec.id} className="flex items-center justify-between gap-3 bg-warm-100 border border-warm-200 rounded-xl px-3 py-2.5 text-xs">
                      <div className="min-w-0">
                        <span className="font-bold text-sage-900 block">{formatDate(rec.date)}</span>
                        <span className="text-[10px] text-sage-400 truncate block">
                          Físico {formatCurrency(rec.totalPhysical)} · Esperado {formatCurrency(rec.totalExpected)}
                        </span>
                        {rec.notes && <span className="text-[10px] text-sage-400 italic truncate block">{rec.notes}</span>}
                      </div>
                      <span className={`shrink-0 font-extrabold text-[11px] px-2 py-0.5 rounded-full ${rec.difference === 0 ? 'bg-green-50 text-green-700' : rec.difference > 0 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500'}`}>
                        {rec.difference === 0 ? 'Cuadrado' : formatCurrency(rec.difference)}
                      </span>
                    </div>
                  ))}
                {reconciliations.length === 0 && (
                  <p className="text-center text-sage-400 italic text-xs py-6">Aún no se han registrado arqueos.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Expense Modal */}
      <Modal isOpen={!!expenseModalEvent} onClose={() => setExpenseModalEvent(null)} title={`Registrar Gasto — ${expenseModalEvent?.name || ''}`}>
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Monto del Gasto (COP) *</label>
            <input
              type="number"
              required
              min="1"
              value={expAmount}
              onChange={e => setExpAmount(e.target.value)}
              placeholder="e.g. 80000"
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Descripción *</label>
            <input
              type="text"
              required
              value={expDescription}
              onChange={e => setExpDescription(e.target.value)}
              placeholder="e.g. Transporte, refrigerios, alquiler de espacio"
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Cuenta de Egreso</label>
            <select
              value={expMethod}
              onChange={e => setExpMethod(e.target.value as any)}
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10 font-medium"
            >
              <option value="Efectivo">Efectivo</option>
              <option value="Nubank">Nubank</option>
              <option value="Bancolombia">Bancolombia</option>
              <option value="Daviplata">Daviplata</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={() => setExpenseModalEvent(null)}
              className="px-6 py-3 border border-warm-300 rounded-xl text-sm font-bold text-sage-600 hover:bg-warm-100 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-sage-600 hover:bg-sage-700 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Guardando...' : 'Registrar Gasto'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Event Creation Modal */}
      <Modal isOpen={eventModalOpen} onClose={() => setEventModalOpen(false)} title="Crear Taller / Evento Especial">
        <form onSubmit={handleCreateEvent} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Nombre del Evento *</label>
            <input 
              type="text" 
              required
              value={evtName}
              onChange={e => setEvtName(e.target.value)}
              placeholder="e.g. Yoga en la Montaña"
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Fecha del Evento</label>
            <input 
              type="date" 
              required
              value={evtDate}
              onChange={e => setEvtDate(e.target.value)}
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Precio Inscripción *</label>
              <input 
                type="number" 
                required
                min="0"
                value={evtPrice}
                onChange={e => setEvtPrice(e.target.value)}
                placeholder="COP"
                className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Capacidad Máxima *</label>
              <input 
                type="number" 
                required
                min="1"
                value={evtCapacity}
                onChange={e => setEvtCapacity(e.target.value)}
                className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={() => setEventModalOpen(false)}
              className="px-6 py-3 border border-warm-300 rounded-xl text-sm font-bold text-sage-600 hover:bg-warm-100 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-sage-600 hover:bg-sage-700 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Guardando...' : 'Crear Taller'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
