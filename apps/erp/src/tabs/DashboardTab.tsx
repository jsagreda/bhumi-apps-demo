import { useMemo, useState, useEffect } from 'react';
import { Transaction, Student } from '../types';
import { formatCurrency } from '../lib/utils';
import { TrendingUp, TrendingDown, DollarSign, Target, Award, AlertTriangle, BookOpen, Pencil, Check, X } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getStatusOf } from './EstudiantesTab';

interface DashboardTabProps {
  transactions: Transaction[];
  students: Student[];
  accounts: string[];
}

// Parse a transaction date as a local Date (avoids UTC-offset day shift)
function txLocalDate(t: Transaction): Date | null {
  if (typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t.date)) {
    const [y, m, d] = t.date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  if (t.date && 'seconds' in (t.date as any)) {
    return new Date((t.date as any).seconds * 1000);
  }
  return null;
}

export default function DashboardTab({ transactions, students, accounts }: DashboardTabProps) {
  const currentYear = new Date().getFullYear();
  const [compareYear, setCompareYear] = useState<number | null>(null);

  const EXCLUDED_CATEGORIES = new Set(['Transferencia', 'Ajuste_Apertura']);

  // Transactions filtered to current year only (for KPIs and monthly table)
  const yearTransactions = useMemo(
    () => transactions.filter(t => { const d = txLocalDate(t); return d ? d.getFullYear() === currentYear : false; }),
    [transactions, currentYear]
  );

  // Operational = year transactions excluding internal moves (no double-counting)
  const operationalTransactions = useMemo(
    () => yearTransactions.filter(t => !EXCLUDED_CATEGORIES.has(t.category)),
    [yearTransactions]
  );

  // Aggregate KPIs — año corriente, solo movimientos operacionales
  const { totalIngresos, totalEgresos, balance } = useMemo(() => {
    let ing = 0, egr = 0;
    operationalTransactions.forEach(t => {
      if (t.type === 'ingreso') ing += Number(t.amount) || 0;
      else egr += Number(t.amount) || 0;
    });
    return { totalIngresos: ing, totalEgresos: egr, balance: ing - egr };
  }, [operationalTransactions]);

  // Aggregate balance by account — histórico completo (saldo real acumulado)
  const accountBalances = useMemo(() => {
    const b: Record<string, number> = {};
    accounts.forEach(a => { b[a] = 0; });
    transactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      b[t.method] = (b[t.method] ?? 0) + (t.type === 'ingreso' ? amt : -amt);
    });
    return b;
  }, [transactions, accounts]);

  // Monthly ledger breakdown — año corriente, solo operacionales
  const monthlyData = useMemo(() => {
    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return months.map((m, idx) => {
      let ing = 0, egr = 0;
      operationalTransactions.forEach(t => {
        const d = txLocalDate(t);
        if (!d || d.getMonth() !== idx) return;
        if (t.type === 'ingreso') ing += t.amount;
        else egr += t.amount;
      });
      return { month: m, ingresos: ing, egresos: egr, balance: ing - egr };
    });
  }, [operationalTransactions]);

  // Available years for comparison
  const availableYears = useMemo(() => {
    const s = new Set<number>();
    transactions.forEach(t => { const d = txLocalDate(t); if (d) s.add(d.getFullYear()); });
    return [...s].filter(y => y !== currentYear).sort().reverse();
  }, [transactions, currentYear]);

  // Comparison year monthly data
  const compareMonthlyData = useMemo(() => {
    if (!compareYear) return null;
    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const compareYearTx = transactions.filter(t => {
      const d = txLocalDate(t);
      return d && d.getFullYear() === compareYear && !EXCLUDED_CATEGORIES.has(t.category);
    });
    return months.map((_, idx) => {
      let ing = 0, egr = 0;
      compareYearTx.forEach(t => {
        const d = txLocalDate(t);
        if (!d || d.getMonth() !== idx) return;
        if (t.type === 'ingreso') ing += t.amount;
        else egr += t.amount;
      });
      return { ingresos: ing, egresos: egr, balance: ing - egr };
    });
  }, [transactions, compareYear, currentYear]);

  // Estudiantes activos = tienen paquete vigente (ok, warn, crit)
  const activeStudents = useMemo(() => {
    const active = new Set(['ok', 'warn', 'crit']);
    return students.filter(s => active.has(getStatusOf(s))).length;
  }, [students]);

  // Margen de crecimiento configurable (persistido en Firestore)
  const [growthMargin, setGrowthMargin] = useState(30);
  const [editingGoals, setEditingGoals] = useState(false);
  const [marginDraft, setMarginDraft] = useState('30');
  const [savingGoals, setSavingGoals] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'config', 'dashboardGoals'))
      .then(snap => {
        if (snap.exists()) {
          const d = snap.data();
          if (d.growthMargin != null) setGrowthMargin(Number(d.growthMargin));
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveGoals = async () => {
    const margin = Math.max(0, Number(marginDraft) || 30);
    setSavingGoals(true);
    try {
      await setDoc(doc(db, 'config', 'dashboardGoals'), {
        growthMargin: margin,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || 'Admin'
      });
      setGrowthMargin(margin);
      setEditingGoals(false);
    } catch (err) {
      console.error('Error guardando metas:', err);
    } finally {
      setSavingGoals(false);
    }
  };

  // Auto-computed metrics from real ERP data
  const stats = useMemo(() => {
    const now = new Date();
    const monthsElapsed = Math.max(1, now.getMonth() + 1);

    // Costos fijos mensuales: Gastos_Fijos + Nomina + Materiales
    const fixedCategories = new Set(['Gastos_Fijos', 'Nomina', 'Materiales']);
    let totalFixed = 0;
    operationalTransactions.forEach(t => {
      if (t.type === 'egreso' && fixedCategories.has(t.category)) totalFixed += t.amount;
    });
    const monthlyFixedCosts = Math.round(totalFixed / monthsElapsed);

    // Ingresos operacionales mensuales promedio
    let totalIncome = 0;
    operationalTransactions.forEach(t => {
      if (t.type === 'ingreso') totalIncome += t.amount;
    });
    const monthlyIncome = totalIncome / monthsElapsed;

    // Ticket promedio por alumno activo por mes
    const avgTicket = activeStudents > 0 ? Math.round(monthlyIncome / activeStudents) : 155000;

    // Punto de equilibrio
    const breakevenStudents = avgTicket > 0 ? Math.max(1, Math.ceil(monthlyFixedCosts / avgTicket)) : 1;

    // Cifra objetivo con margen de crecimiento
    const targetStudents = Math.ceil(breakevenStudents * (1 + growthMargin / 100));

    return {
      monthlyFixedCosts,
      avgTicket,
      breakevenStudents,
      breakevenRevenue: monthlyFixedCosts,
      targetStudents,
      targetRevenue: targetStudents * avgTicket,
    };
  }, [operationalTransactions, activeStudents, growthMargin]);

  // Student membership alerts
  const membershipAlerts = useMemo(() => {
    const critical: Student[] = [];
    const warning: Student[] = [];
    students.forEach(s => {
      if (!s.pack) return;
      if (s.pack === 31) {
        if (!s.fin) return;
        const dif = differenceInDays(parseISO(s.fin), new Date());
        if (dif < 0 || dif <= 3) critical.push(s);
        else if (dif <= 10) warning.push(s);
      } else {
        const remaining = Math.max(0, s.pack - (s.fechas?.length || 0));
        if (remaining === 0) critical.push(s);
        else if (remaining <= 2) warning.push(s);
      }
    });
    return { critical, warning };
  }, [students]);

  // This month's income by category
  const thisMonthIncome = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const cats: Record<string, number> = { Clases: 0, Tienda: 0, Eventos: 0 };
    yearTransactions.forEach(t => {
      if (t.type !== 'ingreso') return;
      const d = txLocalDate(t);
      if (!d || d.getMonth() !== thisMonth) return;
      if (t.category in cats) cats[t.category] += t.amount;
    });
    return cats;
  }, [yearTransactions]);

  const currentMonthName = new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-8">
      {/* Visual Header */}
      <div className="animate-fadeUp relative overflow-hidden rounded-3xl bg-gradient-to-br from-sage-600/10 via-sage-800/5 to-sage-400/10 border border-white/60 px-6 py-7 md:px-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="orb w-40 h-40 bg-sage-800/15 -right-10 -top-14"></div>
        <div className="relative">
          <h2 className="text-3xl font-bold font-serif text-sage-900">Dashboard <span className="text-sage-600">Administrativo</span></h2>
          <p className="text-sm text-sage-500 mt-1">Panel consolidado de contabilidad, proyecciones e indicadores clave.</p>
        </div>
        <div className="relative bg-white/70 backdrop-blur border border-sage-200 px-4 py-2 rounded-2xl flex items-center gap-3">
          <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></span>
          <span className="text-xs font-bold text-sage-900">{activeStudents} Estudiantes Activos</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Income Card */}
        <div className="card-lift animate-fadeUp bg-white p-6 rounded-3xl border border-warm-300 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center text-green-600">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-sage-400 uppercase tracking-wider">Ingresos {currentYear}</p>
            <h4 className="text-2xl font-bold text-sage-900 mt-1">{formatCurrency(totalIngresos)}</h4>
          </div>
        </div>

        {/* Expenses Card */}
        <div className="card-lift animate-fadeUp d-1 bg-white p-6 rounded-3xl border border-warm-300 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center text-red-600">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-sage-400 uppercase tracking-wider">Egresos {currentYear}</p>
            <h4 className="text-2xl font-bold text-sage-900 mt-1">{formatCurrency(totalEgresos)}</h4>
          </div>
        </div>

        {/* Net Balance Card */}
        <div className="card-lift animate-fadeUp d-2 bg-white p-6 rounded-3xl border border-warm-300 shadow-sm flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${balance >= 0 ? 'bg-gradient-to-br from-sage-600/10 to-sage-800/15 text-sage-600' : 'bg-gradient-to-br from-red-50 to-red-100 text-red-600'}`}>
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-sage-400 uppercase tracking-wider">Balance de Caja {currentYear}</p>
            <h4 className={`text-2xl font-bold mt-1 ${balance >= 0 ? 'text-sage-900' : 'text-red-600'}`}>{formatCurrency(balance)}</h4>
          </div>
        </div>
      </div>

      {/* Membership Alerts & Monthly Income Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Membership Alert Panel */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-warm-300 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-warm-200 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold font-serif text-sage-900">Alertas de Membresías</h3>
            {membershipAlerts.critical.length > 0 && (
              <span className="ml-auto text-[10px] bg-red-50 text-red-600 border border-red-200 font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                {membershipAlerts.critical.length} Críticos
              </span>
            )}
          </div>
          <div className="p-4 space-y-2 max-h-52 overflow-y-auto">
            {membershipAlerts.critical.length === 0 && membershipAlerts.warning.length === 0 ? (
              <p className="text-center text-sage-400 italic text-xs py-6">✅ Todos los estudiantes están al día.</p>
            ) : (
              <>
                {membershipAlerts.critical.map(s => {
                  const remaining = s.pack !== 31 ? Math.max(0, s.pack - (s.fechas?.length || 0)) : -1;
                  return (
                    <div key={s.id} className="flex items-center justify-between py-2.5 px-3 bg-red-50 border border-red-100 rounded-2xl text-xs">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-red-200 text-red-700 flex items-center justify-center font-bold text-[10px]">
                          {s.name.substring(0,2).toUpperCase()}
                        </div>
                        <span className="font-bold text-sage-900">{s.name}</span>
                      </div>
                      <span className="text-red-600 font-extrabold">
                        {s.pack === 31 ? 'Vencido' : remaining === 0 ? 'Agotado' : `${remaining} clase${remaining !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                  );
                })}
                {membershipAlerts.warning.map(s => {
                  const remaining = s.pack !== 31 ? Math.max(0, s.pack - (s.fechas?.length || 0)) : null;
                  const daysLeft = s.pack === 31 && s.fin ? differenceInDays(parseISO(s.fin), new Date()) : null;
                  return (
                    <div key={s.id} className="flex items-center justify-between py-2.5 px-3 bg-amber-50 border border-amber-100 rounded-2xl text-xs">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center font-bold text-[10px]">
                          {s.name.substring(0,2).toUpperCase()}
                        </div>
                        <span className="font-bold text-sage-900">{s.name}</span>
                      </div>
                      <span className="text-amber-600 font-extrabold">
                        {remaining !== null ? `${remaining} clases` : daysLeft !== null ? `${daysLeft}d restantes` : ''}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* This Month Income Breakdown */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-warm-300 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-warm-200 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-sage-600" />
            <h3 className="font-bold font-serif text-sage-900 capitalize">Ingresos — {currentMonthName}</h3>
          </div>
          <div className="p-4 space-y-3">
            {Object.entries(thisMonthIncome).map(([cat, amount]) => (
              <div key={cat} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sage-600"></span>
                  <span className="text-sage-500 font-medium text-xs">{cat === 'Clases' ? 'Pago Clases' : cat === 'Tienda' ? 'Venta Tienda' : 'Eventos / Talleres'}</span>
                </div>
                <span className="font-bold text-sage-900 text-sm">{formatCurrency(amount)}</span>
              </div>
            ))}
            <div className="border-t border-warm-200 pt-3 flex items-center justify-between">
              <span className="text-xs font-bold text-sage-400 uppercase tracking-wider">Total del mes</span>
              <span className="text-base font-extrabold text-sage-900">{formatCurrency(Object.values(thisMonthIncome).reduce((a, b) => a + b, 0))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Account Balance Cards */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold font-serif text-sage-900">Saldos por Cuentas / Bancos</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(accountBalances).map(([account, bal]) => (
            <div key={account} className="bg-white p-4 rounded-2xl border border-warm-300 shadow-sm text-center">
              <span className="text-xs font-bold text-sage-400">{account}</span>
              <p className={`text-base font-bold mt-1 ${bal >= 0 ? 'text-sage-900' : 'text-red-500'}`}>{formatCurrency(bal)}</p>
            </div>
          ))}
        </div>
        {/* Total Bhumi */}
        {(() => {
          const total = Object.values(accountBalances).reduce((s, v) => s + v, 0);
          return (
            <div className="bg-gradient-to-r from-sage-900 to-[#22376a] rounded-2xl px-6 py-4 flex items-center justify-between shadow-lg">
              <div>
                <span className="text-[10px] font-bold text-sage-300 uppercase tracking-widest block">Activos Totales Bhumi</span>
                <span className="text-[11px] text-sage-400">Suma de todas las cuentas</span>
              </div>
              <span className={`text-2xl font-extrabold ${total >= 0 ? 'text-white' : 'text-red-300'}`}>
                {formatCurrency(total)}
              </span>
            </div>
          );
        })()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Proyecciones & Metas */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-sage-900 text-white p-6 rounded-3xl border border-sage-800 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[350px]">
            <div className="absolute right-0 top-0 w-36 h-36 bg-sage-800/30 rounded-full blur-2xl pointer-events-none"></div>
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Target className="w-6 h-6 text-sage-800" />
                <h3 className="text-lg font-serif font-bold">Metas Bhumi {new Date().getFullYear()}</h3>
                {!editingGoals ? (
                  <button
                    onClick={() => { setMarginDraft(String(growthMargin)); setEditingGoals(true); }}
                    title="Editar margen de crecimiento"
                    className="ml-auto p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={handleSaveGoals}
                      disabled={savingGoals}
                      title="Guardar"
                      className="p-1.5 rounded-full text-green-400 hover:bg-white/10 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingGoals(false)}
                      title="Cancelar"
                      className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {editingGoals && (
                <div className="mb-5 bg-white/10 rounded-2xl p-3.5">
                  <label className="text-[10px] text-white/60 uppercase tracking-wider font-bold block mb-1">Margen de crecimiento (%)</label>
                  <input
                    type="number" min="0" max="200"
                    value={marginDraft}
                    onChange={e => setMarginDraft(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white/90 text-sage-900 rounded-lg outline-none font-bold"
                  />
                  <p className="text-[10px] text-white/40 mt-1">Porcentaje sobre el punto de equilibrio para definir la cifra objetivo</p>
                </div>
              )}

              {/* Auto-computed breakdown */}
              <div className="grid grid-cols-2 gap-2 mb-5">
                <div className="bg-white/10 rounded-xl p-2.5 text-center">
                  <span className="text-[9px] text-white/50 uppercase tracking-wider block">Costos fijos/mes</span>
                  <span className="text-sm font-extrabold text-white">{formatCurrency(stats.monthlyFixedCosts)}</span>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5 text-center">
                  <span className="text-[9px] text-white/50 uppercase tracking-wider block">Ticket prom./alumno</span>
                  <span className="text-sm font-extrabold text-white">{formatCurrency(stats.avgTicket)}</span>
                </div>
              </div>

              <p className="text-[10px] text-white/50 leading-relaxed mb-4">
                Calculado automáticamente desde egresos (Gastos Fijos + Nómina + Materiales) e ingresos operacionales del año.
              </p>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>Punto de Equilibrio</span>
                    <span>{activeStudents} / {stats.breakevenStudents} Alumnos</span>
                  </div>
                  <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-sage-600 to-sage-800 h-full transition-all duration-700 relative overflow-hidden rounded-full"
                      style={{ width: `${Math.min(100, (activeStudents / stats.breakevenStudents) * 100)}%` }}
                    >
                      <div className="bar-shine"></div>
                    </div>
                  </div>
                  <span className="text-[10px] text-sage-200 mt-1 block">Cubrir: {formatCurrency(stats.breakevenRevenue)}/mes</span>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>Cifra Objetivo (+{growthMargin}%)</span>
                    <span>{activeStudents} / {stats.targetStudents} Alumnos</span>
                  </div>
                  <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-yellow-400 h-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (activeStudents / stats.targetStudents) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-sage-200 mt-1 block">Meta mensual: {formatCurrency(stats.targetRevenue)}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex items-center gap-2 text-xs text-sage-100">
              <Award className="w-4 h-4 text-yellow-400" />
              <span>Basado en {activeStudents} alumno{activeStudents !== 1 ? 's' : ''} activo{activeStudents !== 1 ? 's' : ''} · Margen +{growthMargin}%</span>
            </div>
          </div>
        </div>

        {/* Ledger Proyecciones (Movimiento Mensual) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-lg font-bold font-serif text-sage-900">Resumen Contable Mensual ({currentYear})</h3>
            {availableYears.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-sage-400 uppercase tracking-wider">Comparar vs</span>
                <select
                  value={compareYear ?? ''}
                  onChange={e => setCompareYear(e.target.value ? Number(e.target.value) : null)}
                  className="px-3 py-1.5 text-xs bg-warm-50 border border-warm-300 rounded-xl outline-none font-bold text-sage-700 cursor-pointer"
                >
                  <option value="">Sin comparar</option>
                  {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="bg-white rounded-3xl border border-warm-300 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-warm-200 text-sage-900 border-b border-warm-300 text-xs uppercase tracking-wider font-bold">
                    <th className="px-4 py-4">Mes</th>
                    <th className="px-4 py-4 text-right">Ingresos</th>
                    {compareMonthlyData && <th className="px-3 py-4 text-right text-sage-500">Δ%</th>}
                    <th className="px-4 py-4 text-right">Egresos</th>
                    {compareMonthlyData && <th className="px-3 py-4 text-right text-sage-500">Δ%</th>}
                    <th className="px-4 py-4 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-warm-200 text-sage-900">
                  {monthlyData.map((row, idx) => {
                    const prev = compareMonthlyData?.[idx];
                    const pctIng = prev && prev.ingresos > 0 ? ((row.ingresos - prev.ingresos) / prev.ingresos) * 100 : null;
                    const pctEgr = prev && prev.egresos > 0 ? ((row.egresos - prev.egresos) / prev.egresos) * 100 : null;
                    return (
                    <tr key={idx} className="hover:bg-warm-100/50 transition-colors">
                      <td className="px-4 py-3 font-semibold">{row.month}</td>
                      <td className="px-4 py-3 text-right text-green-600 font-medium">{row.ingresos > 0 ? formatCurrency(row.ingresos) : '-'}</td>
                      {compareMonthlyData && (
                        <td className="px-3 py-3 text-right">
                          {pctIng !== null && row.ingresos > 0 ? (
                            <span className={`text-[10px] font-bold ${pctIng >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {pctIng >= 0 ? '↑' : '↓'}{Math.abs(pctIng).toFixed(0)}%
                            </span>
                          ) : <span className="text-[10px] text-sage-300">—</span>}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right text-red-500 font-medium">{row.egresos > 0 ? formatCurrency(row.egresos) : '-'}</td>
                      {compareMonthlyData && (
                        <td className="px-3 py-3 text-right">
                          {pctEgr !== null && row.egresos > 0 ? (
                            <span className={`text-[10px] font-bold ${pctEgr <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {pctEgr >= 0 ? '↑' : '↓'}{Math.abs(pctEgr).toFixed(0)}%
                            </span>
                          ) : <span className="text-[10px] text-sage-300">—</span>}
                        </td>
                      )}
                      <td className={`px-4 py-3 text-right font-bold ${row.balance >= 0 ? 'text-sage-900' : 'text-red-500'}`}>
                        {row.balance !== 0 ? formatCurrency(row.balance) : '$0'}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
