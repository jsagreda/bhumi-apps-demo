import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Search, ChevronDown, Package, Clock, Filter, AlertTriangle } from 'lucide-react';
import { Student, PROGRAMS } from '../types';
import { getStatusOf, getExpiryLabel, cn } from '../lib/utils';
import { ProgressBar } from '../components/ProgressBar';

interface PacksTabProps {
  students: Student[];
  onEdit: (s: Student) => void;
  onRenew: (s: Student) => void;
}

export default function PacksTab({ students, onEdit, onRenew }: PacksTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = useMemo(() => {
    return students.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
      const status = getStatusOf(s);
      const matchStatus = !statusFilter || (statusFilter === 'urgent' ? ['crit', 'over'].includes(status) : status === statusFilter);
      return matchSearch && matchStatus;
    }).sort((a, b) => {
      const order: Record<string, number> = { over: 0, crit: 1, warn: 2, ok: 3, none: 4 };
      return (order[getStatusOf(a)] || 4) - (order[getStatusOf(b)] || 4) || a.name.localeCompare(b.name);
    });
  }, [students, search, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-6 rounded-3xl border border-warm-300 shadow-sm flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-300" />
          <input 
            type="text" 
            placeholder="Buscar por nombre..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl focus:ring-2 focus:ring-sage-600/10 outline-none text-sm"
          />
        </div>

        <div className="relative">
          <select 
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="pl-4 pr-10 py-3 bg-warm-50 border border-warm-300 rounded-2xl appearance-none focus:ring-2 focus:ring-sage-600/10 outline-none text-sm font-medium text-sage-700"
          >
            <option value="">Todos los estados</option>
            <option value="urgent">Urgente (Crítico/Agotado)</option>
            <option value="warn">Próximo a vencer</option>
            <option value="ok">Al día</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-400" />
        </div>
      </div>

      {/* Cards List */}
      <div className="space-y-3">
        {filtered.map((s, idx) => {
          const status = getStatusOf(s);
          const expiry = getExpiryLabel(s);
          
          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={cn(
                "bg-white p-4 rounded-2xl border flex flex-wrap items-center gap-6 group transition-all",
                status === 'over' || status === 'crit' ? "border-l-4 border-l-red-500 border-warm-300" : "border-warm-300"
              )}
            >
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold text-sage-900">{s.name}</h4>
                  {(status === 'over' || status === 'crit') && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                </div>
                <div className="text-[10px] text-sage-500 uppercase font-black tracking-widest">{s.prog}</div>
              </div>

              <div className="min-w-[150px]">
                <ProgressBar student={s} />
              </div>

              <div className="min-w-[120px]">
                <span className={cn("text-[10px] font-bold px-3 py-1 rounded-full", expiry.cls)}>
                  {expiry.txt}
                </span>
              </div>

              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => onEdit(s)}
                  className="px-3 py-2 border border-warm-300 text-sage-600 rounded-xl text-xs font-bold hover:bg-warm-100 transition-all active:scale-95"
                  title="Editar datos del estudiante"
                >
                  Editar
                </button>
                <button 
                  onClick={() => onRenew(s)}
                  className="px-5 py-2 bg-sage-900 text-white rounded-xl text-xs font-bold shadow-lg shadow-sage-900/10 hover:bg-black transition-all active:scale-95"
                >
                  Renovar
                </button>
              </div>
            </motion.div>
          );
        })}

        {filtered.length === 0 && (
          <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-warm-300">
            <Package className="w-12 h-12 text-warm-200 mx-auto mb-2" />
            <p className="text-sage-400 italic">No hay paquetes que mostrar para estos filtros.</p>
          </div>
        )}
      </div>
    </div>
  );
}
