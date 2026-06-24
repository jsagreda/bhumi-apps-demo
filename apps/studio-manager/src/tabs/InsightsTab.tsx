import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { motion } from 'motion/react';
import {
  Clock,
  TrendingUp,
  CalendarDays,
  AlertCircle,
  Flame,
  Zap,
  Info,
  BarChart3,
  Smartphone,
} from 'lucide-react';
import { Student } from '../types';
import { getStatusOf, getInitials, getExpiryLabel, cn } from '../lib/utils';

interface InsightsTabProps {
  students: Student[];
  onEdit: (s: Student) => void;
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

type InsightView = 'reservas' | 'estudiantes';

export default function InsightsTab({ students, onEdit }: InsightsTabProps) {
  const [view, setView] = useState<InsightView>('reservas');
  const [allBookings, setAllBookings] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'agendamientos'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setAllBookings(list);
    });
    return () => unsub();
  }, []);

  // ─── Analítica de reservas ──────────────────────────────────────────────
  const metrics = useMemo(() => {
    const byDay: Record<number, number> = {};
    const byHour: Record<string, number> = {};
    const byDayHour: Record<string, number> = {};

    allBookings.forEach(b => {
      if (!b.fecha || !b.hora) return;
      const dow = parseISO(b.fecha).getDay();
      byDay[dow] = (byDay[dow] || 0) + 1;
      byHour[b.hora] = (byHour[b.hora] || 0) + 1;
      const key = `${DAY_NAMES[dow]} · ${b.hora}`;
      byDayHour[key] = (byDayHour[key] || 0) + 1;
    });

    const days = Object.entries(byDay)
      .map(([dow, count]) => ({ label: DAY_NAMES[Number(dow)], count }))
      .sort((a, b) => b.count - a.count);

    const hours = Object.entries(byHour)
      .map(([hora, count]) => ({ label: hora, count }))
      .sort((a, b) => b.count - a.count);

    const combos = Object.entries(byDayHour)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const maxDay = days[0]?.count || 1;
    const maxHour = hours[0]?.count || 1;

    // Resumen del mes actual
    const currentMonth = format(new Date(), 'yyyy-MM');
    const monthBookings = allBookings.filter(b => (b.fecha || '').startsWith(currentMonth));
    const monthActive = monthBookings.filter(b => b.estado === 'activo').length;
    const monthCancelled = monthBookings.filter(b => b.estado === 'cancelado').length;
    const monthByProgram: Record<string, number> = {};
    monthBookings.forEach(b => {
      const prog = b.programa || 'Sin programa';
      monthByProgram[prog] = (monthByProgram[prog] || 0) + 1;
    });
    const topProgram = Object.entries(monthByProgram).sort((a, b) => b[1] - a[1])[0];

    const month = {
      total: monthBookings.length,
      active: monthActive,
      cancelled: monthCancelled,
      topProgram: topProgram ? topProgram[0] : '—',
      topProgramCount: topProgram ? topProgram[1] : 0,
      label: format(new Date(), 'MMMM yyyy', { locale: es }),
    };

    return { days, hours, combos, maxDay, maxHour, total: allBookings.length, month };
  }, [allBookings]);

  // ─── Reportes de estudiantes ────────────────────────────────────────────
  const over = useMemo(() => students.filter(s => getStatusOf(s) === 'over' && s.pack !== 31), [students]);
  const crit = useMemo(() => students.filter(s => getStatusOf(s) === 'crit'), [students]);
  const warn = useMemo(() => students.filter(s => getStatusOf(s) === 'warn'), [students]);
  const none = useMemo(() => students.filter(s => getStatusOf(s) === 'none'), [students]);

  const unlimitedExpiring = useMemo(() => {
    return students.filter(s => {
      if (s.pack !== 31 || !s.fin) return false;
      const dif = differenceInDays(parseISO(s.fin), new Date());
      return dif <= 14;
    }).sort((a, b) => {
      const da = differenceInDays(parseISO(a.fin), new Date());
      const db = differenceInDays(parseISO(b.fin), new Date());
      return da - db;
    });
  }, [students]);

  const reportStats = [
    { label: 'Urgentes', count: over.length + crit.length, color: 'text-red-600', bg: 'bg-red-50', icon: Flame },
    { label: 'Por Vencer', count: warn.length, color: 'text-amber-600', bg: 'bg-amber-50', icon: Zap },
    { label: 'Suscripciones', count: students.filter(s => s.pack === 31).length, color: 'text-purple-600', bg: 'bg-purple-50', icon: TrendingUp },
    { label: 'Sin Activo', count: none.length, color: 'text-sage-400', bg: 'bg-warm-100', icon: Info },
  ];

  const Section = ({ title, data, type, icon: Icon }: any) => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", type === 'urgent' ? 'bg-red-100 text-red-600' : type === 'warn' ? 'bg-amber-100 text-amber-600' : 'bg-warm-200 text-sage-600')}>
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="font-serif text-lg text-sage-900">{title}</h3>
        <span className="text-xs font-bold px-2 py-0.5 bg-warm-200 rounded-full text-sage-600">{data.length}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.length > 0 ? data.map((s: Student) => {
          const expiry = getExpiryLabel(s);
          return (
            <motion.div
              key={s.id}
              whileHover={{ y: -2 }}
              className={cn(
                "p-4 bg-white rounded-2xl border border-warm-300 shadow-sm flex items-center gap-4 transition-all hover:shadow-md hover:border-sage-300",
                type === 'urgent' && "border-l-4 border-l-red-500",
                type === 'warn' && "border-l-4 border-l-amber-500",
                type === 'unlimited' && "border-l-4 border-l-purple-500"
              )}
            >
              <div className="w-10 h-10 bg-warm-100 rounded-full flex items-center justify-center font-serif text-xs font-bold text-sage-600 shrink-0">
                {getInitials(s.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-sage-900 truncate">{s.name}</div>
                <div className="text-[10px] text-sage-500 mt-0.5">{s.prog} {s.nota ? `· ${s.nota}` : ''}</div>
              </div>
              <div className="text-right shrink-0">
                <div className={cn("text-[10px] font-black px-2 py-0.5 rounded-md mb-2", expiry.cls)}>
                  {expiry.txt.toUpperCase()}
                </div>
                <button
                  onClick={() => onEdit(s)}
                  className="text-[10px] font-bold text-sage-600 hover:text-sage-900 underline underline-offset-4"
                >
                  RENOVAR
                </button>
              </div>
            </motion.div>
          )
        }) : (
          <div className="col-span-full py-8 text-center text-xs text-sage-400 italic bg-warm-50/50 rounded-2xl border border-dashed border-warm-300">
            Ninguno según este criterio ✨
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Selector de vista */}
      <div className="flex items-center gap-1.5 bg-warm-200/50 p-1.5 rounded-2xl w-fit">
        <button
          onClick={() => setView('reservas')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-300 font-medium text-sm",
            view === 'reservas'
              ? "bg-white text-sage-900 shadow-sm border border-warm-300"
              : "text-sage-500 hover:text-sage-700 hover:bg-warm-200"
          )}
        >
          <Smartphone className={cn("w-4 h-4", view === 'reservas' && "text-sage-600")} />
          Histórico
        </button>
        <button
          onClick={() => setView('estudiantes')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-300 font-medium text-sm",
            view === 'estudiantes'
              ? "bg-white text-sage-900 shadow-sm border border-warm-300"
              : "text-sage-500 hover:text-sage-700 hover:bg-warm-200"
          )}
        >
          <BarChart3 className={cn("w-4 h-4", view === 'estudiantes' && "text-sage-600")} />
          Informes
        </button>
      </div>

      {view === 'reservas' && (
        <div className="space-y-6 animate-fadeUp">
          {metrics.total === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center shadow-sm border border-warm-200">
              <Smartphone className="w-12 h-12 mx-auto text-warm-300 mb-4" />
              <p className="text-sage-500 font-medium">Aún no hay datos de reservas para analizar.</p>
            </div>
          ) : (
            <>
              {/* Resumen del mes */}
              <div className="card-lift bg-gradient-to-br from-sage-900 to-sage-700 rounded-3xl p-6 shadow-sm border border-warm-300 text-white relative overflow-hidden">
                <div className="orb w-40 h-40 bg-sage-600 -top-10 -right-10" />
                <h3 className="font-bold text-sm uppercase tracking-wider text-white/70 mb-4 capitalize relative z-10">
                  Resumen de reservas · {metrics.month.label}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 relative z-10">
                  <div>
                    <div className="text-3xl font-serif font-black">{metrics.month.total}</div>
                    <p className="text-[11px] text-white/60 mt-0.5">Reservas totales</p>
                  </div>
                  <div>
                    <div className="text-3xl font-serif font-black text-green-400">{metrics.month.active}</div>
                    <p className="text-[11px] text-white/60 mt-0.5">Activas</p>
                  </div>
                  <div>
                    <div className="text-3xl font-serif font-black text-red-400">{metrics.month.cancelled}</div>
                    <p className="text-[11px] text-white/60 mt-0.5">Canceladas</p>
                  </div>
                  <div>
                    <div className="text-xl font-serif font-black truncate">{metrics.month.topProgram}</div>
                    <p className="text-[11px] text-white/60 mt-0.5">Programa top ({metrics.month.topProgramCount})</p>
                  </div>
                </div>
              </div>

              {/* Rankings */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Días más concurridos */}
                <div className="card-lift bg-white rounded-3xl p-5 shadow-sm border border-warm-300">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-9 h-9 bg-sage-50 text-sage-600 rounded-xl flex items-center justify-center">
                      <CalendarDays className="w-4.5 h-4.5" />
                    </div>
                    <h3 className="font-bold text-sm text-sage-900">Días más concurridos</h3>
                  </div>
                  <div className="space-y-2.5">
                    {metrics.days.map((d, idx) => (
                      <div key={d.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className={cn("font-medium", idx === 0 ? "text-sage-900 font-bold" : "text-sage-600")}>{d.label}</span>
                          <span className="text-sage-400">{d.count}</span>
                        </div>
                        <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full bg-sage-600", idx === 0 && "bar-shine")}
                            style={{ width: `${(d.count / metrics.maxDay) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Horarios más concurridos */}
                <div className="card-lift bg-white rounded-3xl p-5 shadow-sm border border-warm-300">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-9 h-9 bg-sage-800/10 text-sage-800 rounded-xl flex items-center justify-center">
                      <Clock className="w-4.5 h-4.5" />
                    </div>
                    <h3 className="font-bold text-sm text-sage-900">Horarios más concurridos</h3>
                  </div>
                  <div className="space-y-2.5">
                    {metrics.hours.map((h, idx) => (
                      <div key={h.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className={cn("font-medium", idx === 0 ? "text-sage-900 font-bold" : "text-sage-600")}>{h.label}</span>
                          <span className="text-sage-400">{h.count}</span>
                        </div>
                        <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full bg-sage-800", idx === 0 && "bar-shine")}
                            style={{ width: `${(h.count / metrics.maxHour) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top combinaciones día + hora */}
                <div className="card-lift bg-white rounded-3xl p-5 shadow-sm border border-warm-300">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                      <TrendingUp className="w-4.5 h-4.5" />
                    </div>
                    <h3 className="font-bold text-sm text-sage-900">Sesiones más reservadas</h3>
                  </div>
                  <div className="space-y-2">
                    {metrics.combos.map((c) => (
                      <div key={c.label} className="flex items-center justify-between p-2.5 rounded-xl bg-warm-50 border border-warm-200">
                        <span className="text-xs font-medium text-sage-700">{c.label}</span>
                        <span className="text-[10px] font-bold text-white bg-sage-600 px-2 py-0.5 rounded-full">{c.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {view === 'estudiantes' && (
        <div className="space-y-10 animate-fadeUp">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {reportStats.map((stat, idx) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-white p-6 rounded-3xl border border-warm-300 shadow-sm text-center space-y-2 relative overflow-hidden group"
              >
                <stat.icon className={cn("w-12 h-12 absolute -right-2 -bottom-2 opacity-5 scale-150 transition-transform group-hover:scale-[1.8]", stat.color)} />
                <div className={cn("text-3xl font-serif font-black", stat.color)}>{stat.count}</div>
                <div className="text-[10px] font-bold text-sage-500 uppercase tracking-[0.2em]">{stat.label}</div>
              </motion.div>
            ))}
          </div>

          <div className="space-y-12">
            <Section title="🔴 Agotados o Agendados" data={over} type="urgent" icon={Flame} />
            <Section title="🟠 Críticos — Pocas clases" data={crit} type="urgent" icon={AlertCircle} />
            <Section title="🟡 Por vencer pronto" data={warn} type="warn" icon={Clock} />
            <Section title="🟣 Suscripciones por expirar" data={unlimitedExpiring} type="unlimited" icon={TrendingUp} />
            <Section title="⚪ Sin paquete registrado" data={none} type="none" icon={Info} />
          </div>
        </div>
      )}
    </div>
  );
}
