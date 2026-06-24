import { useState, useMemo, useEffect } from 'react';
import { Student, Transaction } from '../types';
import { formatCurrency } from '../lib/utils';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import {
  Calendar, User, CheckCircle2, AlertCircle, Settings,
  Trash2, Plus, X, Pencil, MinusCircle, UserPlus,
} from 'lucide-react';
import { useColombianHolidays } from '../hooks/useColombianHolidays';
import Modal from '../components/Modal';

interface InstructoresTabProps {
  students: Student[];
  transactions: Transaction[];
  showToast: (msg: string) => void;
}

interface ClassSession {
  key: string;
  dateStr: string;
  timeStr: string;
  dayOfWeek: number;
  studentsCount: number;
  instructor: string;
  rate: number;
  isHalfRate: boolean;
  isManual?: boolean;
}

interface ManualSession {
  key: string;
  dateStr: string;
  timeStr: string;
}

const STUDIO_SCHEDULE: Record<number, string[]> = {
  1: ['7:00 am', '8:15 am', '6:00 pm', '7:15 pm'],
  2: ['7:00 am', '8:15 am', '4:45 pm', '6:00 pm', '7:15 pm'],
  3: ['7:00 am', '8:15 am', '6:00 pm', '7:15 pm'],
  4: ['7:00 am', '8:15 am', '4:45 pm', '6:00 pm', '7:15 pm'],
  5: ['7:00 am', '8:15 am'],
  6: ['8:00 am'],
};

const SESSION_TIMES = ['7:00 am', '8:00 am', '8:15 am', '4:45 pm', '6:00 pm', '7:15 pm'];
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function InstructoresTab({ students, transactions, showToast }: InstructoresTabProps) {
  const { holidays } = useColombianHolidays();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [activeView, setActiveView] = useState<'nomina' | 'tarifas'>('nomina');
  const [saving, setSaving] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<'Nubank' | 'Bancolombia' | 'Daviplata' | 'Efectivo'>('Efectivo');

  // ── Quincena filter ──────────────────────────────────────────
  const [quincena, setQuincena] = useState<'all' | '1' | '2'>('all');

  // ── Rates (instructor list) ──────────────────────────────────
  const [rates, setRates] = useState<Record<string, number>>({
    'Sharon Salazar': 60000,
    'Daniel Herrera': 45000,
    'Angela Herrera': 60000,
    'Alejandra Yusty': 60000,
    'Isabel Elizalde': 30000,
    'Juan Ágreda': 60000,
    'José Herrera': 60000,
  });

  // ── Schedule / overrides / cancellations / manual sessions ───
  const [scheduleMap, setScheduleMap] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [cancelledSessions, setCancelledSessions] = useState<Set<string>>(new Set());
  const [manualSessions, setManualSessions] = useState<ManualSession[]>([]);

  // ── Per-session rate overrides ───────────────────────────────
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({});
  const [editingRate, setEditingRate] = useState<string | null>(null);
  const [editingRateVal, setEditingRateVal] = useState('');

  // ── Debts (saldo adeudado) ────────────────────────────────────
  const [debts, setDebts] = useState<Record<string, number>>({});

  // ── Marked-as-paid (sin movimiento financiero) ────────────────
  const [markedPaid, setMarkedPaid] = useState<Record<string, { date: string }>>({});
  const [debtModal, setDebtModal] = useState<string | null>(null);
  const [debtInput, setDebtInput] = useState('');
  const [savingDebt, setSavingDebt] = useState(false);

  // ── Add-session form ──────────────────────────────────────────
  const [showAddSession, setShowAddSession] = useState(false);
  const [newSessionDate, setNewSessionDate] = useState('');
  const [newSessionTime, setNewSessionTime] = useState('7:00 am');
  const [newSessionInstructor, setNewSessionInstructor] = useState('');

  // ── Add/remove instructor ──────────────────────────────────────
  const [showAddInstructor, setShowAddInstructor] = useState(false);
  const [newInstructorName, setNewInstructorName] = useState('');
  const [newInstructorRate, setNewInstructorRate] = useState('45000');
  const [savingInstructor, setSavingInstructor] = useState(false);

  // ── Load persisted config ────────────────────────────────────
  useEffect(() => {
    getDoc(doc(db, 'config', 'instructorRates'))
      .then(snap => {
        if (snap.exists() && snap.data().rates) {
          setRates(prev => ({ ...prev, ...snap.data().rates }));
        }
      })
      .catch(err => console.warn('No se pudieron cargar tarifas guardadas:', err));

    getDoc(doc(db, 'config', 'instructorSchedule'))
      .then(snap => {
        if (snap.exists() && snap.data().map) {
          setScheduleMap(snap.data().map);
        }
      })
      .catch(err => console.warn('No se pudo cargar el horario de instructores:', err));
  }, []);

  useEffect(() => {
    setOverrides({});
    setCancelledSessions(new Set());
    setManualSessions([]);
    setRateOverrides({});
    setDebts({});
    setMarkedPaid({});
    getDoc(doc(db, 'sessionInstructors', selectedMonth))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          const ov: Record<string, string> = {};
          Object.entries(data).forEach(([k, v]) => {
            if (!k.startsWith('__') && typeof v === 'string') ov[k] = v;
          });
          setOverrides(ov);
          setCancelledSessions(new Set((data.__cancelled as string[]) || []));
          setManualSessions((data.__manual as ManualSession[]) || []);
          setRateOverrides((data.__rateOverrides as Record<string, number>) || {});
          setDebts((data.__debts as Record<string, number>) || {});
          setMarkedPaid((data.__markedPaid as Record<string, { date: string }>) || {});
        }
      })
      .catch(err => console.warn('No se pudieron cargar correcciones de sesiones:', err));
  }, [selectedMonth]);

  // ── Handlers ─────────────────────────────────────────────────
  const handleOverrideInstructor = async (sessionKey: string, name: string) => {
    setOverrides(prev => ({ ...prev, [sessionKey]: name }));
    try {
      await setDoc(doc(db, 'sessionInstructors', selectedMonth), { [sessionKey]: name }, { merge: true });
      showToast("Instructor de la sesión actualizado.");
    } catch (err) {
      console.error(err);
      showToast("Error al guardar el cambio de instructor.");
    }
  };

  const handleDeleteSession = async (sessionKey: string) => {
    const isManual = manualSessions.some(m => m.key === sessionKey);
    if (isManual) {
      const newManual = manualSessions.filter(m => m.key !== sessionKey);
      setManualSessions(newManual);
      try {
        await setDoc(doc(db, 'sessionInstructors', selectedMonth), { __manual: newManual }, { merge: true });
        showToast("Sesión manual eliminada.");
      } catch (err) {
        console.error(err); showToast("Error al eliminar la sesión.");
      }
    } else {
      const newCancelled = new Set(cancelledSessions);
      newCancelled.add(sessionKey);
      setCancelledSessions(newCancelled);
      try {
        await setDoc(doc(db, 'sessionInstructors', selectedMonth), { __cancelled: Array.from(newCancelled) }, { merge: true });
        showToast("Sesión eliminada del listado de nómina.");
      } catch (err) {
        console.error(err); showToast("Error al eliminar la sesión.");
      }
    }
  };

  const handleAddManualSession = async () => {
    if (!newSessionDate || !newSessionTime) { showToast("Completa la fecha y la hora."); return; }
    const key = `${newSessionDate}__${newSessionTime}`;
    const instructor = newSessionInstructor || Object.keys(rates)[0];
    const newManual = [...manualSessions, { key, dateStr: newSessionDate, timeStr: newSessionTime }];
    setManualSessions(newManual);
    setOverrides(prev => ({ ...prev, [key]: instructor }));
    try {
      await setDoc(doc(db, 'sessionInstructors', selectedMonth), { __manual: newManual, [key]: instructor }, { merge: true });
      showToast("Sesión agregada correctamente.");
      setShowAddSession(false);
      setNewSessionDate(''); setNewSessionTime('7:00 am'); setNewSessionInstructor('');
    } catch (err) {
      console.error(err); showToast("Error al agregar la sesión.");
    }
  };

  const handleSaveRateOverride = async (sessionKey: string) => {
    const amount = Number(editingRateVal);
    setEditingRate(null);
    if (isNaN(amount) || amount < 0) return;
    const newOverrides = { ...rateOverrides, [sessionKey]: amount };
    setRateOverrides(newOverrides);
    try {
      await setDoc(doc(db, 'sessionInstructors', selectedMonth), { __rateOverrides: newOverrides }, { merge: true });
      showToast("Tarifa de sesión actualizada.");
    } catch (err) {
      console.error(err); showToast("Error al guardar la tarifa.");
    }
  };

  const handleMarkAsPaid = async (name: string) => {
    const key = `${name}__${quincena}`;
    const today = new Date().toISOString().split('T')[0];
    const newMarked = { ...markedPaid, [key]: { date: today } };
    setMarkedPaid(newMarked);
    try {
      await setDoc(doc(db, 'sessionInstructors', selectedMonth), { __markedPaid: newMarked }, { merge: true });
      showToast(`${name} marcado como pagado.`);
    } catch (err) { console.error(err); showToast("Error al marcar como pagado."); }
  };

  const handleUnmarkPaid = async (name: string) => {
    const key = `${name}__${quincena}`;
    const newMarked = { ...markedPaid };
    delete newMarked[key];
    setMarkedPaid(newMarked);
    try {
      await setDoc(doc(db, 'sessionInstructors', selectedMonth), { __markedPaid: newMarked }, { merge: true });
      showToast(`${name} desmarcado.`);
    } catch (err) { console.error(err); showToast("Error al desmarcar."); }
  };

  const handleOpenDebtModal = (name: string) => {
    setDebtInput(String(debts[name] || ''));
    setDebtModal(name);
  };

  const handleSaveDebt = async () => {
    if (!debtModal) return;
    setSavingDebt(true);
    try {
      const amount = Number(debtInput) || 0;
      const newDebts = { ...debts };
      if (amount === 0) delete newDebts[debtModal]; else newDebts[debtModal] = amount;
      setDebts(newDebts);
      await setDoc(doc(db, 'sessionInstructors', selectedMonth), { __debts: newDebts }, { merge: true });
      setDebtModal(null);
      showToast(`Saldo adeudado de ${debtModal} actualizado.`);
    } catch (err) {
      console.error(err); showToast("Error al guardar.");
    } finally { setSavingDebt(false); }
  };

  const handleSaveSchedule = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'instructorSchedule'), { map: scheduleMap, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || 'Admin' });
      showToast("Horario de instructores guardado.");
    } catch (err) {
      console.error(err); showToast("Error al guardar el horario.");
    } finally { setSaving(false); }
  };

  const handleSaveRates = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'instructorRates'), { rates, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || 'Admin' });
      showToast("Tarifas guardadas correctamente.");
    } catch (err) {
      console.error(err); showToast("Error al guardar las tarifas.");
    } finally { setSaving(false); }
  };

  const handleAddInstructor = async () => {
    const name = newInstructorName.trim();
    if (!name) { showToast("Escribe el nombre del instructor."); return; }
    if (rates[name] !== undefined) { showToast("Ya existe un instructor con ese nombre."); return; }
    setSavingInstructor(true);
    try {
      const newRates = { ...rates, [name]: Number(newInstructorRate) || 45000 };
      setRates(newRates);
      await setDoc(doc(db, 'config', 'instructorRates'), { rates: newRates, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || 'Admin' });
      setShowAddInstructor(false);
      setNewInstructorName(''); setNewInstructorRate('45000');
      showToast(`Instructor "${name}" agregado.`);
    } catch (err) {
      console.error(err); showToast("Error al agregar instructor.");
    } finally { setSavingInstructor(false); }
  };

  const handleRemoveInstructor = async (name: string) => {
    if (!window.confirm(`¿Eliminar a ${name} de la lista de instructores? No afecta registros históricos.`)) return;
    try {
      const newRates = { ...rates };
      delete newRates[name];
      setRates(newRates);
      await setDoc(doc(db, 'config', 'instructorRates'), { rates: newRates, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || 'Admin' });
      showToast(`Instructor "${name}" eliminado.`);
    } catch (err) {
      console.error(err); showToast("Error al eliminar instructor.");
    }
  };

  const getDefaultInstructorFor = (day: number, time: string) => {
    if (day === 6) return 'Isabel Elizalde';
    const isMorning = time.includes('am') || !time;
    if (isMorning) {
      if (day === 1 || day === 3 || day === 5) return 'Sharon Salazar';
      return 'Daniel Herrera';
    }
    if (day === 1 || day === 3) return 'Angela Herrera';
    if (day === 2 || day === 4) return 'Alejandra Yusty';
    return 'Sharon Salazar';
  };

  const resolveInstructor = (sessionKey: string, dow: number, time: string) => {
    if (overrides[sessionKey]) return overrides[sessionKey];
    if (scheduleMap[`${dow}__${time}`]) return scheduleMap[`${dow}__${time}`];
    return getDefaultInstructorFor(dow, time);
  };

  // ── All sessions for the month ────────────────────────────────
  const sessions: ClassSession[] = useMemo(() => {
    const sessionMap: Record<string, { key: string; dateStr: string; timeStr: string; count: number; isManual?: boolean }> = {};
    const n = new Date();
    const todayStr = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
    const [yr, mo] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(yr, mo, 0).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
      if (dateStr > todayStr) break;
      if (holidays.has(dateStr)) continue;
      const dow = new Date(dateStr + 'T12:00:00').getDay();
      (STUDIO_SCHEDULE[dow] || []).forEach(time => {
        const key = `${dateStr}__${time}`;
        sessionMap[key] = { key, dateStr, timeStr: time, count: 0 };
      });
    }

    students.forEach(s => {
      s.fechas?.forEach(sessionKey => {
        const [datePart, timePart] = sessionKey.split('__');
        if (datePart && datePart.startsWith(selectedMonth)) {
          if (!sessionMap[sessionKey]) sessionMap[sessionKey] = { key: sessionKey, dateStr: datePart, timeStr: timePart || '', count: 0 };
          sessionMap[sessionKey].count++;
        }
      });
    });

    manualSessions.forEach(m => {
      if (!sessionMap[m.key]) sessionMap[m.key] = { key: m.key, dateStr: m.dateStr, timeStr: m.timeStr, count: 0, isManual: true };
    });

    return Object.values(sessionMap)
      .filter(s => !cancelledSessions.has(s.key))
      .map(session => {
        const dateObj = new Date(session.dateStr + 'T12:00:00');
        const dow = dateObj.getDay();
        const inst = resolveInstructor(session.key, dow, session.timeStr);
        const baseRate = rates[inst] || 45000;
        const isHalfRate = session.count === 0;
        const rateOverride = rateOverrides[session.key];
        const rate = rateOverride !== undefined ? rateOverride : (isHalfRate ? Math.round(baseRate / 2) : baseRate);
        return { key: session.key, dateStr: session.dateStr, timeStr: session.timeStr, dayOfWeek: dow, studentsCount: session.count, instructor: inst, rate, isHalfRate, isManual: session.isManual };
      })
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.timeStr.localeCompare(b.timeStr));
  }, [students, selectedMonth, rates, scheduleMap, overrides, cancelledSessions, manualSessions, holidays, rateOverrides]);

  // ── Quincena-filtered sessions ────────────────────────────────
  const filteredSessions = useMemo(() => {
    if (quincena === 'all') return sessions;
    return sessions.filter(s => {
      const day = parseInt(s.dateStr.split('-')[2], 10);
      return quincena === '1' ? day <= 15 : day > 15;
    });
  }, [sessions, quincena]);

  // ── Instructor stats ──────────────────────────────────────────
  const instructorStats = useMemo(() => {
    const stats: Record<string, {
      name: string; classesCount: number; totalOwed: number; debt: number;
      netOwed: number; isPaid: boolean; paidViaTransaction: boolean; payoutDate?: string;
    }> = {};

    Object.keys(rates).forEach(name => {
      stats[name] = { name, classesCount: 0, totalOwed: 0, debt: debts[name] || 0, netOwed: 0, isPaid: false, paidViaTransaction: false };
    });

    filteredSessions.forEach(s => {
      if (stats[s.instructor]) {
        stats[s.instructor].classesCount++;
        stats[s.instructor].totalOwed += s.rate;
      }
    });

    Object.values(stats).forEach(s => { s.netOwed = Math.max(0, s.totalOwed - s.debt); });

    // Check paid via financial transaction
    transactions.forEach(t => {
      if (t.category === 'Nomina' && t.type === 'egreso') {
        Object.keys(stats).forEach(name => {
          const structuredMatch = t.instructorName === name && t.period === selectedMonth;
          const legacyMatch = !t.instructorName && t.description.includes(name) && t.description.includes(selectedMonth);
          if (structuredMatch || legacyMatch) {
            const tQ = (t as any).quincena as string | undefined;
            const matches = quincena === 'all' ? !tQ : tQ === quincena || !tQ;
            if (matches) {
              stats[name].isPaid = true;
              stats[name].paidViaTransaction = true;
              stats[name].payoutDate = typeof t.date === 'string' ? t.date : (t.date as any).seconds ? new Date((t.date as any).seconds * 1000).toISOString().split('T')[0] : '';
            }
          }
        });
      }
    });

    // Check manually marked as paid
    Object.keys(stats).forEach(name => {
      if (!stats[name].isPaid) {
        const mp = markedPaid[`${name}__${quincena}`];
        if (mp) {
          stats[name].isPaid = true;
          stats[name].paidViaTransaction = false;
          stats[name].payoutDate = mp.date;
        }
      }
    });

    return Object.values(stats);
  }, [filteredSessions, transactions, selectedMonth, rates, debts, quincena, markedPaid]);

  const handlePayInstructor = async (name: string, netAmount: number, debt: number) => {
    if (netAmount <= 0) { showToast("Este instructor no tiene saldo en este período."); return; }
    const debtInfo = debt > 0 ? ` (descuento inventario: ${formatCurrency(debt)})` : '';
    const periodLabel = quincena === '1' ? `${selectedMonth} Q1 (1-15)` : quincena === '2' ? `${selectedMonth} Q2 (16-fin)` : selectedMonth;
    if (!window.confirm(`¿Confirmas el pago de ${formatCurrency(netAmount)} a ${name}?\n\nPeríodo: ${periodLabel}${debtInfo}\nCuenta: ${payoutMethod}`)) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'transactions'), {
        date: new Date().toISOString().split('T')[0],
        type: 'egreso', amount: netAmount, method: payoutMethod,
        category: 'Nomina',
        description: `Pago nómina ${name} - Periodo: ${periodLabel}${debtInfo}`,
        instructorName: name, period: selectedMonth,
        ...(quincena !== 'all' ? { quincena } : {}),
        createdBy: auth.currentUser?.email || 'Admin',
        createdAt: serverTimestamp(),
      });
      // Clear debt after payment
      if (debt > 0) {
        const newDebts = { ...debts };
        delete newDebts[name];
        setDebts(newDebts);
        await setDoc(doc(db, 'sessionInstructors', selectedMonth), { __debts: newDebts }, { merge: true });
      }
      showToast(`Pago registrado para ${name}.`);
    } catch (err) {
      console.error(err); showToast("Error al registrar el pago.");
    } finally { setSaving(false); }
  };

  const handleRateChange = (instructor: string, val: string) => {
    setRates(prev => ({ ...prev, [instructor]: Number(val) || 0 }));
  };

  const [yr, mo] = selectedMonth.split('-').map(Number);
  const monthMin = `${selectedMonth}-01`;
  const monthMax = `${selectedMonth}-${String(new Date(yr, mo, 0).getDate()).padStart(2, '0')}`;

  const totalFiltered = filteredSessions.reduce((s, x) => s + x.rate, 0);
  const totalMonth = sessions.reduce((s, x) => s + x.rate, 0);

  return (
    <div className="space-y-6">
      {/* ── Tab Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-warm-200 pb-2">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveView('nomina')}
            className={`pb-2.5 font-bold text-sm tracking-wide transition-all border-b-2 cursor-pointer ${activeView === 'nomina' ? 'text-sage-900 border-sage-600 font-extrabold' : 'text-sage-400 border-transparent hover:text-sage-600'}`}
          >
            Nómina del Mes
          </button>
          <button
            onClick={() => setActiveView('tarifas')}
            className={`pb-2.5 font-bold text-sm tracking-wide transition-all border-b-2 cursor-pointer ${activeView === 'tarifas' ? 'text-sage-900 border-sage-600 font-extrabold' : 'text-sage-400 border-transparent hover:text-sage-600'}`}
          >
            Configuración de Tarifas
          </button>
        </div>
        {activeView === 'nomina' && (
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-sage-400 uppercase tracking-wider hidden sm:block">Periodo:</label>
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-warm-300 rounded-xl outline-none font-bold text-sage-900" />
          </div>
        )}
      </div>

      {/* ── NOMINA VIEW ── */}
      {activeView === 'nomina' && (
        <div className="space-y-6">
          {/* Quincena + Account selector */}
          <div className="bg-white p-4 rounded-2xl border border-warm-300 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <AlertCircle className="w-5 h-5 text-sage-600 shrink-0" />
              <span className="text-xs font-medium text-sage-700">Quincena:</span>
              {([['all','Mes completo'],['1','Q1 (1-15)'],['2','Q2 (16-fin)']] as const).map(([v,l]) => (
                <button key={v} onClick={() => setQuincena(v)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${quincena === v ? 'bg-sage-900 text-white' : 'bg-warm-100 text-sage-500 hover:bg-warm-200'}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-sage-400 uppercase tracking-wider">Cuenta egreso:</span>
              <select value={payoutMethod} onChange={e => setPayoutMethod(e.target.value as any)}
                className="px-4 py-2 text-xs bg-warm-100 border border-warm-300 rounded-xl outline-none font-bold">
                <option value="Efectivo">Efectivo</option>
                <option value="Nubank">Nubank</option>
                <option value="Bancolombia">Bancolombia</option>
                <option value="Daviplata">Daviplata</option>
              </select>
            </div>
          </div>

          {/* Instructor Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {instructorStats.map(inst => {
              const hasOwed = inst.totalOwed > 0;
              return (
                <div key={inst.name} className="card-lift animate-fadeUp bg-white p-5 rounded-3xl border border-warm-300 shadow-sm flex flex-col justify-between min-h-[180px]">
                  <div>
                    <div className="flex items-center justify-between border-b border-warm-100 pb-2 mb-3">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-sage-500" />
                        <h4 className="font-bold text-sm text-sage-900">{inst.name}</h4>
                      </div>
                      {inst.isPaid ? (
                        <span className="text-[9px] bg-green-50 text-green-700 font-black uppercase tracking-wider px-2 py-0.5 rounded-full">PAGADO</span>
                      ) : hasOwed ? (
                        <span className="text-[9px] bg-yellow-50 text-yellow-700 font-black uppercase tracking-wider px-2 py-0.5 rounded-full">PENDIENTE</span>
                      ) : (
                        <span className="text-[9px] bg-warm-200 text-sage-400 font-black uppercase tracking-wider px-2 py-0.5 rounded-full">SIN ACTIVIDAD</span>
                      )}
                    </div>

                    <div className="space-y-1 text-xs">
                      <p className="text-sage-500">Sesiones: <span className="font-bold text-sage-900">{inst.classesCount}</span></p>
                      <p className="text-sage-500">Total bruto: <span className="font-bold text-sage-900">{formatCurrency(inst.totalOwed)}</span></p>
                      {inst.debt > 0 && (
                        <p className="text-red-500">Saldo adeudado: <span className="font-bold">− {formatCurrency(inst.debt)}</span></p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-end justify-between pt-3 border-t border-warm-100 mt-3 gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-sage-400 uppercase tracking-wider block">
                        {inst.debt > 0 ? 'Neto a Pagar' : 'Total a Pagar'}
                      </span>
                      <span className={`text-lg font-extrabold ${inst.debt > 0 ? 'text-sage-600' : 'text-sage-900'}`}>
                        {formatCurrency(inst.netOwed)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenDebtModal(inst.name)}
                        title="Registrar saldo adeudado"
                        className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${inst.debt > 0 ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-warm-100 text-sage-400 hover:bg-warm-200 hover:text-sage-600'}`}
                      >
                        <MinusCircle className="w-4 h-4" />
                      </button>
                      {!inst.isPaid && hasOwed && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleMarkAsPaid(inst.name)}
                            title="Marcar como pagado sin crear movimiento financiero"
                            className="px-3 py-2 rounded-xl text-xs font-bold border border-warm-300 text-sage-500 hover:border-sage-400 hover:text-sage-700 hover:bg-warm-100 transition-all cursor-pointer"
                          >
                            Marcar pagado
                          </button>
                          <button
                            onClick={() => handlePayInstructor(inst.name, inst.netOwed, inst.debt)}
                            disabled={saving}
                            className="bg-sage-900 hover:bg-black text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                          >
                            Pagar
                          </button>
                        </div>
                      )}
                      {inst.isPaid && inst.paidViaTransaction && (
                        <div className="flex items-center gap-1.5 text-xs text-green-600 font-semibold">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{inst.payoutDate}</span>
                        </div>
                      )}
                      {inst.isPaid && !inst.paidViaTransaction && (
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center gap-1 text-xs text-blue-600 font-semibold">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{inst.payoutDate}</span>
                          </div>
                          <button
                            onClick={() => handleUnmarkPaid(inst.name)}
                            title="Desmarcar pago"
                            className="p-1 text-sage-300 hover:text-red-400 transition-all cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sessions Ledger */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold font-serif text-sage-900">
                Listado de Sesiones
                <span className="ml-2 text-[10px] font-bold text-sage-400 bg-warm-200 px-2 py-0.5 rounded-full">{filteredSessions.length}</span>
              </h3>
              <button
                onClick={() => setShowAddSession(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sage-600 border border-sage-600/30 rounded-xl hover:bg-sage-600/5 transition-all cursor-pointer"
              >
                {showAddSession ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {showAddSession ? 'Cancelar' : 'Agregar sesión'}
              </button>
            </div>

            {showAddSession && (
              <div className="bg-white border border-sage-600/20 rounded-2xl p-4 space-y-3 animate-fadeUp">
                <p className="text-xs font-bold text-sage-500 uppercase tracking-wider">Nueva sesión manual</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-sage-400 uppercase tracking-wider block mb-1">Fecha</label>
                    <input type="date" value={newSessionDate} min={monthMin} max={monthMax}
                      onChange={e => setNewSessionDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-warm-100 border border-warm-300 rounded-xl outline-none font-bold text-sage-900" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-sage-400 uppercase tracking-wider block mb-1">Hora</label>
                    <select value={newSessionTime} onChange={e => setNewSessionTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-warm-100 border border-warm-300 rounded-xl outline-none font-bold text-sage-900">
                      {SESSION_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-sage-400 uppercase tracking-wider block mb-1">Instructor</label>
                    <select value={newSessionInstructor || Object.keys(rates)[0]} onChange={e => setNewSessionInstructor(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-warm-100 border border-warm-300 rounded-xl outline-none font-bold text-sage-900">
                      {Object.keys(rates).map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={handleAddManualSession}
                  className="flex items-center gap-1.5 bg-sage-600 hover:bg-sage-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> Guardar sesión
                </button>
              </div>
            )}

            <div className="bg-white rounded-3xl border border-warm-300 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-warm-200 text-sage-900 border-b border-warm-300 uppercase tracking-wider font-bold">
                      <th className="px-4 md:px-6 py-3.5">Fecha</th>
                      <th className="px-4 md:px-6 py-3.5">Hora</th>
                      <th className="px-4 md:px-6 py-3.5">Instructor</th>
                      <th className="px-4 md:px-6 py-3.5 text-center hidden sm:table-cell">Alumnos</th>
                      <th className="px-4 md:px-6 py-3.5 text-right">Tarifa</th>
                      <th className="px-2 py-3.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 text-sage-900">
                    {filteredSessions.map(s => (
                      <tr key={s.key} className={`hover:bg-warm-100/50 transition-colors ${s.isHalfRate && !s.isManual ? 'opacity-75' : ''} ${s.isManual ? 'bg-sage-600/3' : ''}`}>
                        <td className="px-4 md:px-6 py-3 whitespace-nowrap text-sage-500 font-medium">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-sage-300 shrink-0" />
                            <span>{s.dateStr}</span>
                            {s.isManual && <span className="text-[8px] bg-sage-600/10 text-sage-600 font-black px-1 rounded">MANUAL</span>}
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-3 font-semibold text-sage-900 whitespace-nowrap">{s.timeStr || 'Sin hora'}</td>
                        <td className="px-4 md:px-6 py-3">
                          <div className="flex items-center gap-1">
                            <User className={`w-3 h-3 shrink-0 ${overrides[s.key] ? 'text-sage-600' : 'text-sage-400'}`} />
                            <select value={s.instructor} onChange={e => handleOverrideInstructor(s.key, e.target.value)}
                              title={overrides[s.key] ? 'Instructor corregido manualmente' : 'Cambiar instructor de esta sesión'}
                              className={`bg-transparent border rounded-lg px-1.5 py-1 text-xs font-semibold outline-none cursor-pointer transition-all max-w-[130px] ${overrides[s.key] ? 'border-sage-600/40 text-sage-600 bg-sage-600/5' : 'border-transparent text-sage-900 hover:border-warm-300 hover:bg-warm-100'}`}>
                              {Object.keys(rates).map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-3 text-center hidden sm:table-cell">
                          {s.isHalfRate && !s.isManual ? (
                            <span className="bg-amber-50 border border-amber-200 text-amber-600 px-2 py-0.5 rounded-md font-bold text-[10px]">Sin asistentes · 50%</span>
                          ) : (
                            <span className="bg-warm-200 px-2 py-0.5 rounded-md font-bold text-sage-700">
                              {s.isManual ? '—' : `${s.studentsCount} alumno${s.studentsCount !== 1 ? 's' : ''}`}
                            </span>
                          )}
                        </td>
                        <td className="px-4 md:px-6 py-3 text-right font-bold text-sage-900 whitespace-nowrap">
                          {editingRate === s.key ? (
                            <input
                              type="number" autoFocus
                              value={editingRateVal}
                              onChange={e => setEditingRateVal(e.target.value)}
                              onBlur={() => handleSaveRateOverride(s.key)}
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveRateOverride(s.key); if (e.key === 'Escape') setEditingRate(null); }}
                              className="w-24 px-2 py-1 text-right bg-warm-100 border border-sage-600/30 rounded-lg outline-none font-bold text-sage-900 text-xs"
                            />
                          ) : (
                            <button
                              onClick={() => { setEditingRate(s.key); setEditingRateVal(String(s.rate)); }}
                              title="Editar tarifa de esta sesión"
                              className={`flex items-center gap-1 ml-auto hover:text-sage-600 group cursor-pointer ${rateOverrides[s.key] !== undefined ? 'text-sage-600' : ''}`}
                            >
                              {formatCurrency(s.rate)}
                              <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                            </button>
                          )}
                        </td>
                        <td className="pr-3 py-3">
                          <button onClick={() => handleDeleteSession(s.key)} title="Eliminar sesión"
                            className="p-1.5 rounded-lg text-sage-300 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredSessions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-sage-400 italic">
                          No se registraron asistencias ni clases para este período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {filteredSessions.length > 0 && (
                    <tfoot>
                      {quincena !== 'all' && (
                        <tr className="border-t border-warm-200">
                          <td colSpan={4} className="px-4 md:px-6 py-2.5 text-xs font-bold text-sage-400 uppercase tracking-wider">
                            Mes completo ({sessions.length} sesiones)
                          </td>
                          <td className="px-4 md:px-6 py-2.5 text-right font-bold text-sage-500">
                            {formatCurrency(totalMonth)}
                          </td>
                          <td></td>
                        </tr>
                      )}
                      <tr className="bg-warm-200/60 border-t border-warm-300">
                        <td colSpan={4} className="px-4 md:px-6 py-3 text-xs font-bold text-sage-500 uppercase tracking-wider">
                          {quincena === 'all' ? 'Total del período' : quincena === '1' ? 'Total Quincena 1 (1-15)' : 'Total Quincena 2 (16-fin)'}
                        </td>
                        <td className="px-4 md:px-6 py-3 text-right font-extrabold text-sage-900">
                          {formatCurrency(totalFiltered)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RATES CONFIG VIEW ── */}
      {activeView === 'tarifas' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Rates + Instructor management */}
          <div className="animate-fadeUp bg-white p-6 rounded-3xl border border-warm-300 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-warm-100 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-sage-600" />
                <h3 className="font-bold text-sage-900 font-serif">Instructores y Honorarios</h3>
              </div>
              <button
                onClick={() => { setShowAddInstructor(v => !v); setNewInstructorName(''); setNewInstructorRate('45000'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sage-600 border border-sage-600/30 rounded-xl hover:bg-sage-600/5 transition-all cursor-pointer"
              >
                {showAddInstructor ? <X className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                {showAddInstructor ? 'Cancelar' : 'Agregar instructor'}
              </button>
            </div>

            {showAddInstructor && (
              <div className="bg-warm-50 border border-warm-200 rounded-2xl p-4 space-y-3 animate-fadeUp">
                <p className="text-[10px] font-bold text-sage-400 uppercase tracking-wider">Nuevo instructor</p>
                <div className="flex gap-3">
                  <input type="text" placeholder="Nombre completo" value={newInstructorName}
                    onChange={e => setNewInstructorName(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs bg-white border border-warm-300 rounded-xl outline-none font-medium text-sage-900" />
                  <input type="number" placeholder="Tarifa COP" value={newInstructorRate}
                    onChange={e => setNewInstructorRate(e.target.value)}
                    className="w-28 px-3 py-2 text-xs bg-white border border-warm-300 rounded-xl outline-none font-bold text-sage-900 text-right" />
                </div>
                <button onClick={handleAddInstructor} disabled={savingInstructor || !newInstructorName.trim()}
                  className="flex items-center gap-1.5 bg-sage-600 hover:bg-sage-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer">
                  <UserPlus className="w-3.5 h-3.5" />
                  {savingInstructor ? 'Guardando...' : 'Agregar'}
                </button>
              </div>
            )}

            <p className="text-xs text-sage-500">Valor pagado por sesión regular. Los cambios puntuales se hacen directamente en la tabla de sesiones.</p>
            <div className="space-y-3">
              {Object.entries(rates).map(([name, rate]) => (
                <div key={name} className="flex items-center justify-between gap-3 py-2 border-b border-warm-100">
                  <span className="text-xs font-bold text-sage-900 flex-1">{name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-sage-400 font-semibold">$</span>
                    <input type="number" value={rate} onChange={e => handleRateChange(name, e.target.value)}
                      className="w-28 px-3 py-1.5 text-xs bg-warm-100 border border-warm-300 rounded-lg outline-none font-bold text-sage-900 text-right" />
                    <span className="text-[10px] text-sage-400 font-bold uppercase">COP</span>
                    <button onClick={() => handleRemoveInstructor(name)} title="Eliminar instructor"
                      className="p-1.5 text-sage-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-2">
              <button onClick={handleSaveRates} disabled={saving}
                className="bg-sage-600 hover:bg-sage-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer">
                {saving ? 'Guardando...' : 'Guardar Tarifas'}
              </button>
            </div>
          </div>

          {/* Schedule config */}
          <div className="animate-fadeUp bg-white p-6 rounded-3xl border border-warm-300 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-warm-100 pb-3">
              <Calendar className="w-5 h-5 text-sage-600" />
              <h3 className="font-bold text-sage-900 font-serif">Horario Base de Instructores</h3>
            </div>
            <p className="text-xs text-sage-500">Define el instructor titular de cada franja. Los reemplazos puntuales se corrigen directamente en la lista de sesiones.</p>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5, 6].map(dow => (
                <div key={dow}>
                  <span className="text-[10px] font-bold text-sage-400 uppercase tracking-widest block mb-1.5">{DAY_NAMES[dow]}</span>
                  <div className="space-y-1.5">
                    {(STUDIO_SCHEDULE[dow] || []).map(time => {
                      const mapKey = `${dow}__${time}`;
                      const current = scheduleMap[mapKey] || getDefaultInstructorFor(dow, time);
                      return (
                        <div key={mapKey} className="flex items-center justify-between gap-3 bg-warm-100 border border-warm-200 rounded-xl px-3 py-1.5">
                          <span className="text-xs font-bold text-sage-900 w-20 shrink-0">{time}</span>
                          <select value={current} onChange={e => setScheduleMap(prev => ({ ...prev, [mapKey]: e.target.value }))}
                            className="flex-1 px-2 py-1.5 text-xs bg-white border border-warm-300 rounded-lg outline-none font-semibold text-sage-900 cursor-pointer">
                            {Object.keys(rates).map(name => <option key={name} value={name}>{name}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-2">
              <button onClick={handleSaveSchedule} disabled={saving}
                className="bg-sage-600 hover:bg-sage-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer">
                {saving ? 'Guardando...' : 'Guardar Horario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Debt Modal ── */}
      <Modal isOpen={debtModal !== null} onClose={() => setDebtModal(null)} title={`Saldo adeudado — ${debtModal}`}>
        <div className="space-y-4">
          <p className="text-sm text-sage-500 leading-relaxed">
            Registra lo que el instructor debe descontar de su pago (ej. productos de inventario tomados). Se restará del total a pagar y se limpiará al registrar el pago.
          </p>
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Monto a descontar (COP)</label>
            <input type="number" min="0" value={debtInput} onChange={e => setDebtInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveDebt(); }}
              placeholder="0"
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10" />
            {Number(debtInput) > 0 && (
              <p className="text-[11px] text-sage-400 mt-1.5">
                El pago neto será: <strong className="text-sage-700">
                  {formatCurrency(Math.max(0, (instructorStats.find(i => i.name === debtModal)?.totalOwed || 0) - Number(debtInput)))}
                </strong>
              </p>
            )}
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setDebtModal(null)}
              className="px-6 py-3 border border-warm-300 rounded-xl text-sm font-bold text-sage-600 hover:bg-warm-100 transition-all cursor-pointer">
              Cancelar
            </button>
            <button onClick={handleSaveDebt} disabled={savingDebt}
              className="bg-sage-600 hover:bg-sage-700 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-2">
              <MinusCircle className="w-4 h-4" />
              {savingDebt ? 'Guardando...' : 'Guardar Descuento'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
