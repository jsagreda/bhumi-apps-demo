import React, { useState, useMemo, useEffect } from 'react';
import { Transaction } from '../types';
import { formatCurrency, formatDate } from '../lib/utils';
import {
  Plus, Search, Trash2, Calendar, FileText, CreditCard,
  Pencil, TrendingUp, TrendingDown, ArrowRightLeft, PlusCircle, Download, Tag,
} from 'lucide-react';
import { downloadCsv } from '../lib/exportCsv';
import { db, auth } from '../lib/firebase';
import {
  collection, addDoc, deleteDoc, updateDoc, doc,
  getDoc, setDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import Modal from '../components/Modal';

interface FinanzasTabProps {
  transactions: Transaction[];
  showToast: (msg: string) => void;
  accounts: string[];
  onAccountsChange: (accounts: string[]) => void;
  categories: string[];
  onCategoriesChange: (categories: string[]) => void;
}

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function getDateStr(date: Transaction['date']): string {
  if (typeof date === 'string') return date.slice(0, 10);
  return new Date((date as any).seconds * 1000).toISOString().slice(0, 10);
}

export default function FinanzasTab({ transactions, showToast, accounts, onAccountsChange, categories, onCategoriesChange }: FinanzasTabProps) {
  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentQuarter = Math.ceil(currentMonth / 3);

  // ── Period filter ─────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'mes'|'trimestre'|'año'|'todo'>('mes');
  const [selectedYear,    setSelectedYear]    = useState(currentYear);
  const [selectedMonth,   setSelectedMonth]   = useState(currentMonth);
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);

  // ── Secondary filters ──────────────────────────────────────────
  const [search,          setSearch]          = useState('');
  const [typeFilter,      setTypeFilter]      = useState('');
  const [methodFilter,    setMethodFilter]    = useState('');
  const [categoryFilter,  setCategoryFilter]  = useState('');

  // ── Transaction form ───────────────────────────────────────────
  const [modalOpen,      setModalOpen]      = useState(false);
  const [editingTx,      setEditingTx]      = useState<Transaction | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [formType,       setFormType]       = useState<'ingreso'|'egreso'>('ingreso');
  const [formAmount,     setFormAmount]     = useState('');
  const [formMethod,     setFormMethod]     = useState<string>(accounts[0] ?? 'Nubank');
  const [formCategory,   setFormCategory]   = useState<string>('Otros');
  const [formDate,       setFormDate]       = useState(now.toISOString().split('T')[0]);
  const [formDescription,setFormDescription]= useState('');

  // ── Real balances ──────────────────────────────────────────────
  const [realBalances,     setRealBalances]     = useState<Record<string,number>|null>(null);
  const [balanceAsOf,      setBalanceAsOf]      = useState('');
  const [balancesModal,    setBalancesModal]    = useState(false);
  const [balanceForm,      setBalanceForm]      = useState<Record<string,string>>({});
  const [balanceFormDate,  setBalanceFormDate]  = useState(now.toISOString().split('T')[0]);
  const [savingBalances,   setSavingBalances]   = useState(false);
  const [savingAdjust,     setSavingAdjust]     = useState(false);

  // ── Transfer ──────────────────────────────────────────────────
  const [transferModal, setTransferModal] = useState(false);
  const [txFrom,        setTxFrom]        = useState<string>('Efectivo');
  const [txTo,          setTxTo]          = useState<string>('Bancolombia');
  const [txAmount,      setTxAmount]      = useState('');
  const [txDate,        setTxDate]        = useState(now.toISOString().split('T')[0]);
  const [txNote,        setTxNote]        = useState('');
  const [savingTx,      setSavingTx]      = useState(false);

  // ── Nueva cuenta ───────────────────────────────────────────────
  const [newAccountModal, setNewAccountModal] = useState(false);
  const [newAccountName,  setNewAccountName]  = useState('');
  const [savingAccount,   setSavingAccount]   = useState(false);

  // ── Nueva categoría ────────────────────────────────────────────
  const [newCategoryModal, setNewCategoryModal] = useState(false);
  const [newCategoryName,  setNewCategoryName]  = useState('');
  const [savingCategory,   setSavingCategory]   = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'config', 'accountBalances')).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      setRealBalances({ Nubank: d.Nubank||0, Bancolombia: d.Bancolombia||0, Daviplata: d.Daviplata||0, Efectivo: d.Efectivo||0 });
      setBalanceAsOf(d.asOf || '');
    }).catch(() => {});
  }, []);

  // ── Derived data ───────────────────────────────────────────────
  const availableYears = useMemo(() => {
    const s = new Set<number>([currentYear]);
    transactions.forEach(t => s.add(Number(getDateStr(t.date).slice(0, 4))));
    return [...s].sort().reverse();
  }, [transactions, currentYear]);

  const periodTransactions = useMemo(() => {
    return transactions.filter(t => {
      const d = getDateStr(t.date);
      const y = Number(d.slice(0, 4));
      const m = Number(d.slice(5, 7));
      if (viewMode === 'mes')       return y === selectedYear && m === selectedMonth;
      if (viewMode === 'trimestre') return y === selectedYear && Math.ceil(m / 3) === selectedQuarter;
      if (viewMode === 'año')       return y === selectedYear;
      return true;
    });
  }, [transactions, viewMode, selectedYear, selectedMonth, selectedQuarter]);

  const filtered = useMemo(() => {
    return periodTransactions
      .filter(t => {
        const ok1 = !search         || t.description.toLowerCase().includes(search.toLowerCase());
        const ok2 = !typeFilter     || t.type     === typeFilter;
        const ok3 = !methodFilter   || t.method   === methodFilter;
        const ok4 = !categoryFilter || t.category === categoryFilter;
        return ok1 && ok2 && ok3 && ok4;
      })
      .sort((a, b) => getDateStr(b.date).localeCompare(getDateStr(a.date)));
  }, [periodTransactions, search, typeFilter, methodFilter, categoryFilter]);

  const computedBalances = useMemo(() => {
    const b: Record<string,number> = {};
    accounts.forEach(a => { b[a] = 0; });
    transactions.forEach(t => {
      b[t.method] = (b[t.method] ?? 0) + (t.type === 'ingreso' ? t.amount : -t.amount);
    });
    return b;
  }, [transactions, accounts]);

  const summary = useMemo(() => {
    let ing = 0, egr = 0;
    filtered
      .filter(t => t.category !== 'Transferencia' && t.category !== 'Ajuste_Apertura')
      .forEach(t => { if (t.type === 'ingreso') ing += t.amount; else egr += t.amount; });
    return { ing, egr, bal: ing - egr };
  }, [filtered]);

  const periodLabel = useMemo(() => {
    if (viewMode === 'mes')       return `${MONTHS[selectedMonth - 1]} ${selectedYear}`;
    if (viewMode === 'trimestre') return `Q${selectedQuarter} ${selectedYear}`;
    if (viewMode === 'año')       return `Año ${selectedYear}`;
    return 'Histórico completo';
  }, [viewMode, selectedYear, selectedMonth, selectedQuarter]);

  // ── Form handlers ──────────────────────────────────────────────
  const resetForm = () => {
    setEditingTx(null); setFormAmount(''); setFormDescription('');
    setFormCategory('Otros'); setFormType('ingreso'); setFormMethod('Nubank');
    setFormDate(now.toISOString().split('T')[0]);
  };

  const handleOpenCreate = () => { resetForm(); setModalOpen(true); };

  const handleOpenEdit = (t: Transaction) => {
    setEditingTx(t);
    setFormType(t.type); setFormAmount(String(t.amount));
    setFormMethod(t.method); setFormCategory(t.category);
    setFormDate(getDateStr(t.date)); setFormDescription(t.description);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAmount || Number(formAmount) <= 0 || !formDescription.trim()) {
      showToast("Completa todos los campos correctamente."); return;
    }
    setSaving(true);
    try {
      const data = { date: formDate, type: formType, amount: Number(formAmount),
        method: formMethod, category: formCategory, description: formDescription.trim() };
      if (editingTx) {
        await updateDoc(doc(db, 'transactions', editingTx.id),
          { ...data, editedBy: auth.currentUser?.email || 'Admin', editedAt: serverTimestamp() });
        showToast("Movimiento actualizado.");
      } else {
        await addDoc(collection(db, 'transactions'),
          { ...data, createdBy: auth.currentUser?.email || 'Admin', createdAt: serverTimestamp() });
        showToast("Movimiento registrado.");
      }
      setModalOpen(false); resetForm();
    } catch (err) { console.error(err); showToast("Error al guardar."); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Eliminar este movimiento? Esto afecta los balances.")) return;
    try { await deleteDoc(doc(db, 'transactions', id)); showToast("Movimiento eliminado."); }
    catch { showToast("Error al eliminar."); }
  };

  const openBalancesModal = () => {
    const form: Record<string,string> = {};
    accounts.forEach(a => { form[a] = realBalances ? String(realBalances[a] ?? '') : ''; });
    setBalanceForm(form);
    setBalanceFormDate(now.toISOString().split('T')[0]);
    setBalancesModal(true);
  };

  const handleAddAccount = async () => {
    const name = newAccountName.trim();
    if (!name) { showToast("Escribe el nombre de la cuenta."); return; }
    if (accounts.map(a => a.toLowerCase()).includes(name.toLowerCase())) {
      showToast("Ya existe una cuenta con ese nombre."); return;
    }
    setSavingAccount(true);
    try {
      const newAccounts = [...accounts, name];
      await setDoc(doc(db, 'config', 'accounts'), { accounts: newAccounts }, { merge: true });
      onAccountsChange(newAccounts);
      setNewAccountModal(false);
      setNewAccountName('');
      showToast(`Cuenta "${name}" creada.`);
    } catch { showToast("Error al crear la cuenta."); }
    finally { setSavingAccount(false); }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) { showToast("Escribe el nombre de la categoría."); return; }
    if (categories.map(c => c.toLowerCase()).includes(name.toLowerCase())) {
      showToast("Ya existe una categoría con ese nombre."); return;
    }
    setSavingCategory(true);
    try {
      const newCategories = [...categories, name];
      await setDoc(doc(db, 'config', 'categories'), { categories: newCategories }, { merge: true });
      onCategoriesChange(newCategories);
      setNewCategoryModal(false);
      setNewCategoryName('');
      showToast(`Categoría "${name}" creada.`);
    } catch { showToast("Error al crear la categoría."); }
    finally { setSavingCategory(false); }
  };

  const handleExport = () => {
    const headers = ['Fecha', 'Tipo', 'Cuenta', 'Categoría', 'Monto', 'Descripción', 'Creado Por'];
    const rows = filtered.map(t => [
      getDateStr(t.date),
      t.type,
      t.method,
      t.category,
      t.type === 'ingreso' ? t.amount : -t.amount,
      t.description,
      t.createdBy,
    ]);
    const label = periodLabel.replace(/\s/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    downloadCsv(`transacciones-${label}.csv`, headers, rows);
  };

  const handleTransfer = async () => {
    if (!txAmount || Number(txAmount) <= 0) { showToast("Ingresa un monto válido."); return; }
    if (txFrom === txTo) { showToast("Las cuentas de origen y destino deben ser distintas."); return; }
    setSavingTx(true);
    try {
      const transferId = crypto.randomUUID();
      const note = txNote.trim();
      const desc = `Transferencia ${txFrom} → ${txTo}${note ? ` · ${note}` : ''}`;
      const base = {
        date: txDate,
        amount: Number(txAmount),
        category: 'Transferencia' as const,
        description: desc,
        refId: transferId,
        createdBy: auth.currentUser?.email || 'Admin',
        createdAt: serverTimestamp(),
      };
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'transactions')), { ...base, type: 'egreso',  method: txFrom });
      batch.set(doc(collection(db, 'transactions')), { ...base, type: 'ingreso', method: txTo });
      await batch.commit();
      setTransferModal(false);
      setTxAmount(''); setTxNote('');
      showToast("Transferencia registrada.");
    } catch (err) { console.error(err); showToast("Error al registrar la transferencia."); }
    finally { setSavingTx(false); }
  };

  const handleCreateOpeningEntries = async () => {
    if (!realBalances) return;
    const adjustments: { method: string; type: 'ingreso'|'egreso'; amount: number }[] = [];
    for (const method of accounts) {
      const diff = realBalances[method] - (computedBalances[method] || 0);
      if (Math.abs(diff) < 1) continue;
      adjustments.push({ method, type: diff > 0 ? 'ingreso' : 'egreso', amount: Math.abs(diff) });
    }
    if (adjustments.length === 0) { showToast("No hay diferencias que ajustar."); return; }
    const lines = adjustments.map(a => `${a.method}: ${a.type === 'ingreso' ? '+' : '-'}$${a.amount.toLocaleString('es-CO')}`).join('\n');
    if (!window.confirm(`Se crearán ${adjustments.length} asiento(s) de apertura:\n\n${lines}\n\n¿Confirmar?`)) return;
    setSavingAdjust(true);
    try {
      const today = now.toISOString().split('T')[0];
      const batch = writeBatch(db);
      for (const adj of adjustments) {
        batch.set(doc(collection(db, 'transactions')), {
          date: today,
          type: adj.type,
          amount: adj.amount,
          method: adj.method,
          category: 'Ajuste_Apertura' as const,
          description: `Ajuste de apertura ${adj.method} — cuadre saldo real`,
          createdBy: auth.currentUser?.email || 'Admin',
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
      setBalancesModal(false);
      showToast("Asientos de apertura creados. Los saldos ahora cuadran.");
    } catch (err) { console.error(err); showToast("Error al crear asientos."); }
    finally { setSavingAdjust(false); }
  };

  const handleSaveBalances = async () => {
    setSavingBalances(true);
    try {
      const balances: Record<string,number> = {};
      accounts.forEach(a => { balances[a] = Number(balanceForm[a]) || 0; });
      const data = { ...balances, asOf: balanceFormDate, updatedBy: auth.currentUser?.email || 'Admin', updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'config', 'accountBalances'), data);
      setRealBalances(balances);
      setBalanceAsOf(balanceFormDate);
      setBalancesModal(false);
      showToast("Saldos reales actualizados.");
    } catch { showToast("Error al guardar saldos."); }
    finally { setSavingBalances(false); }
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-serif text-sage-900">Libro Mayor Contable</h2>
          <p className="text-sm text-sage-400 mt-0.5">
            {periodLabel} · {filtered.length} movimiento{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExport}
            className="bg-warm-200 hover:bg-warm-300 text-sage-800 px-4 py-3 rounded-2xl flex items-center gap-2 transition-all text-sm font-bold cursor-pointer border border-warm-300"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
          <button
            onClick={() => setTransferModal(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-3 rounded-2xl flex items-center gap-2 transition-all duration-300 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 text-sm font-bold cursor-pointer"
          >
            <ArrowRightLeft className="w-5 h-5" /> Transferencia
          </button>
          <button
            onClick={handleOpenCreate}
            className="bg-sage-600 hover:bg-sage-700 text-white px-5 py-3 rounded-2xl flex items-center gap-2 transition-all duration-300 shadow-lg shadow-sage-600/25 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 text-sm font-bold cursor-pointer"
          >
            <Plus className="w-5 h-5" /> Registrar Movimiento
          </button>
        </div>
      </div>

      {/* ── Period selector ── */}
      <div className="bg-white p-5 rounded-3xl border border-warm-300 shadow-sm space-y-4">
        {/* Mode tabs */}
        <div className="flex gap-1 bg-warm-100 p-1 rounded-2xl w-fit">
          {([['mes','Mensual'],['trimestre','Trimestral'],['año','Anual'],['todo','Histórico']] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === mode
                  ? 'bg-white text-sage-900 shadow-sm border border-warm-300'
                  : 'text-sage-500 hover:text-sage-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Year + month / quarter controls */}
        {viewMode !== 'todo' && (
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="pl-4 pr-8 py-2.5 bg-warm-50 border border-warm-300 rounded-xl text-sm font-bold text-sage-800 outline-none focus:ring-2 focus:ring-sage-600/10 appearance-none cursor-pointer"
            >
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            {viewMode === 'mes' && (
              <div className="flex flex-wrap gap-1.5">
                {MONTHS.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedMonth(i + 1)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedMonth === i + 1
                        ? 'bg-sage-600 text-white shadow-sm'
                        : 'bg-warm-100 text-sage-500 hover:bg-warm-200 hover:text-sage-700'
                    }`}
                  >
                    {m.slice(0, 3)}
                  </button>
                ))}
              </div>
            )}

            {viewMode === 'trimestre' && (
              <div className="flex gap-2">
                {[1,2,3,4].map(q => (
                  <button
                    key={q}
                    onClick={() => setSelectedQuarter(q)}
                    className={`px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedQuarter === q
                        ? 'bg-sage-600 text-white shadow-sm'
                        : 'bg-warm-100 text-sage-500 hover:bg-warm-200 hover:text-sage-700'
                    }`}
                  >
                    Q{q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Account balances card ── */}
      <div className="bg-white p-5 rounded-3xl border border-warm-300 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-sage-900">Saldos de Cuentas</h3>
            {balanceAsOf && (
              <p className="text-[11px] text-sage-400 mt-0.5">
                Corte real: {balanceAsOf.split('-').reverse().join('/')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => { setNewCategoryName(''); setNewCategoryModal(true); }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-sage-600 bg-warm-100 hover:bg-warm-200 rounded-xl transition-all cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5" />
              Nueva categoría
            </button>
            <button
              onClick={() => { setNewAccountName(''); setNewAccountModal(true); }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-sage-600 bg-warm-100 hover:bg-warm-200 rounded-xl transition-all cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Nueva cuenta
            </button>
            <button
              onClick={openBalancesModal}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-sage-600 bg-warm-100 hover:bg-warm-200 rounded-xl transition-all cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              {realBalances ? 'Calibrar saldos' : 'Ingresar saldos reales'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {accounts.map(method => {
            const computed = computedBalances[method] || 0;
            const real     = realBalances?.[method];
            const diff     = real !== undefined ? real - computed : null;

            return (
              <div key={method} className="bg-warm-50 rounded-2xl p-4 border border-warm-200 space-y-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-sage-400" />
                  <span className="text-xs font-bold text-sage-700">{method}</span>
                </div>

                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-sage-400 uppercase tracking-wider block mb-0.5">Saldo real</span>
                    {real !== undefined ? (
                      <span className={`text-base font-extrabold ${real >= 0 ? 'text-sage-900' : 'text-red-600'}`}>
                        {formatCurrency(real)}
                      </span>
                    ) : (
                      <span className="text-sm font-semibold text-sage-300 italic">Sin calibrar</span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] text-sage-400 uppercase tracking-wider block mb-0.5">Calculado</span>
                    <span className={`text-sm font-semibold ${computed >= 0 ? 'text-sage-600' : 'text-red-500'}`}>
                      {formatCurrency(computed)}
                    </span>
                  </div>

                  {diff !== null && (
                    <div className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg ${
                      Math.abs(diff) < 1000
                        ? 'bg-green-50 text-green-700'
                        : diff > 0
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-red-50 text-red-600'
                    }`}>
                      {diff >= 0 ? <TrendingUp className="w-3 h-3 shrink-0" /> : <TrendingDown className="w-3 h-3 shrink-0" />}
                      <span>{diff >= 0 ? '+' : ''}{formatCurrency(diff)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!realBalances && (
          <p className="text-[11px] text-sage-400 mt-4 text-center leading-relaxed">
            El saldo calculado es el resultado matemático de todos los movimientos registrados.<br/>
            Calibra con el saldo real de tus cuentas para ver si los libros cuadran.
          </p>
        )}

        {/* Total Bhumi */}
        {(() => {
          const vals = accounts.map(a => realBalances?.[a] ?? computedBalances[a] ?? 0);
          const total = vals.reduce((s, v) => s + v, 0);
          const allReal = realBalances !== null;
          return (
            <div className="mt-4 bg-gradient-to-r from-sage-900 to-[#22376a] rounded-2xl px-6 py-4 flex items-center justify-between shadow-lg">
              <div>
                <span className="text-[10px] font-bold text-sage-300 uppercase tracking-widest block">Activos Totales Bhumi</span>
                <span className="text-[11px] text-sage-400">{allReal ? 'Basado en saldos reales calibrados' : 'Basado en saldo calculado'}</span>
              </div>
              <span className={`text-2xl font-extrabold ${total >= 0 ? 'text-white' : 'text-red-300'}`}>
                {formatCurrency(total)}
              </span>
            </div>
          );
        })()}
      </div>

      {/* ── Secondary filters ── */}
      <div className="bg-white p-5 rounded-3xl border border-warm-300 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-300" />
            <input
              type="text"
              placeholder="Buscar descripción..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-warm-50 border border-warm-300 rounded-2xl focus:ring-2 focus:ring-sage-600/10 outline-none text-sm"
            />
          </div>

          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="pl-4 pr-8 py-2.5 bg-warm-50 border border-warm-300 rounded-2xl appearance-none text-sm font-medium text-sage-700 outline-none focus:ring-2 focus:ring-sage-600/10 cursor-pointer">
            <option value="">Tipo</option>
            <option value="ingreso">Ingreso</option>
            <option value="egreso">Egreso</option>
          </select>

          <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)}
            className="pl-4 pr-8 py-2.5 bg-warm-50 border border-warm-300 rounded-2xl appearance-none text-sm font-medium text-sage-700 outline-none focus:ring-2 focus:ring-sage-600/10 cursor-pointer">
            <option value="">Cuenta</option>
            {accounts.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="pl-4 pr-8 py-2.5 bg-warm-50 border border-warm-300 rounded-2xl appearance-none text-sm font-medium text-sage-700 outline-none focus:ring-2 focus:ring-sage-600/10 cursor-pointer">
            <option value="">Categoría</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="Transferencia">Transferencia</option>
            <option value="Ajuste_Apertura">Ajuste Apertura</option>
          </select>

          {(search || typeFilter || methodFilter || categoryFilter) && (
            <button
              onClick={() => { setSearch(''); setTypeFilter(''); setMethodFilter(''); setCategoryFilter(''); }}
              className="text-xs font-bold text-sage-400 hover:text-sage-700 px-3 py-2.5 rounded-xl hover:bg-warm-100 transition-all cursor-pointer"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── Summary banner ── */}
      {filtered.length > 0 && (
        <div className="bg-sage-900 text-white rounded-2xl px-6 py-4 flex flex-wrap gap-6 items-center justify-between shadow-xl shadow-sage-900/10">
          <span className="text-xs font-bold text-sage-300 uppercase tracking-wider">{periodLabel}</span>
          <div className="flex gap-6 flex-wrap">
            <div className="text-center">
              <span className="text-[10px] text-sage-400 uppercase tracking-widest block">Ingresos</span>
              <span className="text-sm font-extrabold text-green-400">+ {formatCurrency(summary.ing)}</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] text-sage-400 uppercase tracking-widest block">Egresos</span>
              <span className="text-sm font-extrabold text-red-400">- {formatCurrency(summary.egr)}</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] text-sage-400 uppercase tracking-widest block">Neto</span>
              <span className={`text-sm font-extrabold ${summary.bal >= 0 ? 'text-white' : 'text-red-300'}`}>
                {formatCurrency(summary.bal)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Ledger table ── */}
      <div className="bg-white rounded-3xl border border-warm-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-warm-200 text-sage-900 border-b border-warm-300 text-xs uppercase tracking-wider font-bold">
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Descripción</th>
                <th className="px-6 py-4">Categoría</th>
                <th className="px-6 py-4">Cuenta</th>
                <th className="px-6 py-4 text-right">Monto</th>
                <th className="px-6 py-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200 text-sage-900">
              {filtered.map(t => {
                const isTransfer = t.category === 'Transferencia';
                return (
                <tr key={t.id} className={`hover:bg-warm-100/50 transition-colors ${isTransfer ? 'bg-blue-50/40' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap text-sage-500 font-medium">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-sage-300" />
                      {formatDate(t.date)}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-semibold text-sage-900">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        {isTransfer && <ArrowRightLeft className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                        <span>{t.description}</span>
                      </div>
                      <span className="text-[10px] text-sage-400 font-normal">{t.createdBy}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      isTransfer
                        ? 'bg-blue-100 text-blue-700 border-blue-200'
                        : 'bg-sage-100 text-sage-900 border-sage-200'
                    }`}>
                      {t.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sage-500 font-medium">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-sage-300" />
                      {t.method}
                    </div>
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-right font-bold ${
                    isTransfer
                      ? t.type === 'ingreso' ? 'text-blue-500' : 'text-blue-400'
                      : t.type === 'ingreso' ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {t.type === 'ingreso' ? '+' : '−'} {formatCurrency(t.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleOpenEdit(t)}
                        className="text-sage-400 hover:text-sage-600 p-1.5 rounded-full hover:bg-warm-200 transition-all cursor-pointer">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(t.id)}
                        className="text-sage-300 hover:text-red-500 p-1.5 rounded-full hover:bg-warm-200 transition-all cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sage-400">
                    <FileText className="w-12 h-12 text-warm-200 mx-auto mb-3" />
                    <p className="text-sm font-medium">Sin movimientos para {periodLabel}</p>
                    {viewMode !== 'todo' && (
                      <p className="text-xs text-sage-300 mt-1">Prueba cambiando el período o usando "Histórico"</p>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Transaction modal ── */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); resetForm(); }}
        title={editingTx ? 'Editar Movimiento' : 'Registrar Movimiento'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Tipo</label>
            <div className="grid grid-cols-2 gap-2 bg-warm-200 p-1 rounded-2xl">
              {(['ingreso','egreso'] as const).map(type => (
                <button key={type} type="button" onClick={() => setFormType(type)}
                  className={`py-2 rounded-xl text-sm font-bold transition-all ${formType === type ? 'bg-white text-sage-900 shadow-sm border border-warm-300' : 'text-sage-500'}`}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Monto (COP)</label>
            <input type="number" required min="1" value={formAmount} onChange={e => setFormAmount(e.target.value)}
              placeholder="Ej. 150000" className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10" />
          </div>
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Fecha</label>
            <input type="date" required value={formDate} onChange={e => setFormDate(e.target.value)}
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10" />
          </div>
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Cuenta</label>
            <select value={formMethod} onChange={e => setFormMethod(e.target.value)}
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10 font-medium">
              {accounts.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Categoría</label>
            <select value={formCategory} onChange={e => setFormCategory(e.target.value)}
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10 font-medium">
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Descripción</label>
            <textarea required rows={3} value={formDescription} onChange={e => setFormDescription(e.target.value)}
              placeholder="Ej. Pago arriendo local Mayo"
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10" />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)}
              className="px-6 py-3 border border-warm-300 rounded-xl text-sm font-bold text-sage-600 hover:bg-warm-100 transition-all cursor-pointer">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="bg-sage-600 hover:bg-sage-700 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer">
              {saving ? 'Guardando...' : editingTx ? 'Guardar Cambios' : 'Registrar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Nueva cuenta modal ── */}
      <Modal isOpen={newAccountModal} onClose={() => setNewAccountModal(false)} title="Agregar Nueva Cuenta">
        <div className="space-y-4">
          <p className="text-sm text-sage-500 leading-relaxed">
            La nueva cuenta quedará disponible en todos los selectores de la app (movimientos, transferencias, calibración).
          </p>
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Nombre de la cuenta</label>
            <input
              type="text"
              value={newAccountName}
              onChange={e => setNewAccountName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAccount(); } }}
              placeholder="Ej. Scotiabank, Nequi, Caja Chica..."
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setNewAccountModal(false)}
              className="px-6 py-3 border border-warm-300 rounded-xl text-sm font-bold text-sage-600 hover:bg-warm-100 transition-all cursor-pointer">
              Cancelar
            </button>
            <button onClick={handleAddAccount} disabled={savingAccount || !newAccountName.trim()}
              className="bg-sage-600 hover:bg-sage-700 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-2">
              <PlusCircle className="w-4 h-4" />
              {savingAccount ? 'Guardando...' : 'Crear Cuenta'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Nueva categoría modal ── */}
      <Modal isOpen={newCategoryModal} onClose={() => setNewCategoryModal(false)} title="Agregar Nueva Categoría">
        <div className="space-y-4">
          <p className="text-sm text-sage-500 leading-relaxed">
            La nueva categoría quedará disponible en el formulario de movimientos para clasificar ingresos y egresos.
          </p>
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Nombre de la categoría</label>
            <input
              type="text"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
              placeholder="Ej. Publicidad, Arriendo, Servicios..."
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setNewCategoryModal(false)}
              className="px-6 py-3 border border-warm-300 rounded-xl text-sm font-bold text-sage-600 hover:bg-warm-100 transition-all cursor-pointer">
              Cancelar
            </button>
            <button onClick={handleAddCategory} disabled={savingCategory || !newCategoryName.trim()}
              className="bg-sage-600 hover:bg-sage-700 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-2">
              <Tag className="w-4 h-4" />
              {savingCategory ? 'Guardando...' : 'Crear Categoría'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Transfer modal ── */}
      <Modal isOpen={transferModal} onClose={() => setTransferModal(false)} title="Registrar Transferencia">
        <div className="space-y-4">
          <p className="text-sm text-sage-500 leading-relaxed">
            Crea un movimiento de salida en la cuenta origen y uno de entrada en la cuenta destino de forma atómica.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Desde</label>
              <select value={txFrom} onChange={e => setTxFrom(e.target.value)}
                className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10 font-medium">
                {accounts.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Hacia</label>
              <select value={txTo} onChange={e => setTxTo(e.target.value)}
                className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10 font-medium">
                {accounts.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          {txFrom === txTo && (
            <p className="text-xs text-red-500 font-semibold">Las cuentas deben ser distintas.</p>
          )}
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Monto (COP)</label>
            <input type="number" min="1" value={txAmount} onChange={e => setTxAmount(e.target.value)}
              placeholder="Ej. 500000"
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10" />
          </div>
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Fecha</label>
            <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)}
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10" />
          </div>
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Nota (opcional)</label>
            <input type="text" value={txNote} onChange={e => setTxNote(e.target.value)}
              placeholder="Ej. Para rendimientos CDT"
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10" />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setTransferModal(false)}
              className="px-6 py-3 border border-warm-300 rounded-xl text-sm font-bold text-sage-600 hover:bg-warm-100 transition-all cursor-pointer">
              Cancelar
            </button>
            <button onClick={handleTransfer} disabled={savingTx || txFrom === txTo || !txAmount}
              className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              {savingTx ? 'Registrando...' : 'Registrar Transferencia'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Real balances modal ── */}
      <Modal isOpen={balancesModal} onClose={() => setBalancesModal(false)} title="Calibrar Saldos Reales">
        <div className="space-y-4">
          <p className="text-sm text-sage-500 leading-relaxed">
            Ingresa el saldo actual de cada cuenta según tu app bancaria. Esto solo registra el valor de referencia — no modifica ninguna transacción.
          </p>
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Fecha de corte</label>
            <input type="date" value={balanceFormDate} onChange={e => setBalanceFormDate(e.target.value)}
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10" />
          </div>
          {accounts.map(method => (
            <div key={method}>
              <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">{method}</label>
              <input
                type="number"
                value={balanceForm[method] ?? ''}
                onChange={e => setBalanceForm(prev => ({ ...prev, [method]: e.target.value }))}
                placeholder="0"
                className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10"
              />
              <p className="text-[11px] text-sage-400 mt-1 ml-1">
                Calculado histórico: <strong>{formatCurrency(computedBalances[method] || 0)}</strong>
                {balanceForm[method] && Number(balanceForm[method]) !== 0 && (
                  <> · Diferencia: <strong className={Number(balanceForm[method]) - (computedBalances[method]||0) >= 0 ? 'text-green-600' : 'text-red-500'}>
                    {formatCurrency(Number(balanceForm[method]) - (computedBalances[method]||0))}
                  </strong></>
                )}
              </p>
            </div>
          ))}
          {realBalances && accounts.some(m => Math.abs(realBalances[m] - (computedBalances[m] || 0)) >= 1) && (
            <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-amber-800">Hay diferencias entre el saldo real y el calculado</p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                Crea asientos de apertura que cuadren los libros con la realidad. Úsalo una sola vez al arrancar con datos históricos incompletos.
              </p>
              <button
                onClick={handleCreateOpeningEntries}
                disabled={savingAdjust}
                className="w-full mt-1 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {savingAdjust ? 'Creando asientos...' : 'Crear asientos de apertura'}
              </button>
            </div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setBalancesModal(false)}
              className="px-6 py-3 border border-warm-300 rounded-xl text-sm font-bold text-sage-600 hover:bg-warm-100 transition-all cursor-pointer">
              Cancelar
            </button>
            <button onClick={handleSaveBalances} disabled={savingBalances}
              className="bg-sage-600 hover:bg-sage-700 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer">
              {savingBalances ? 'Guardando...' : 'Guardar Saldos'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
