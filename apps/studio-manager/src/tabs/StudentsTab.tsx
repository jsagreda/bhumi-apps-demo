import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Filter,
  MoreVertical,
  Mail,
  Calendar,
  Edit2,
  Trash2,
  Eye,
  ChevronDown,
  Users,
  UserCheck,
  UserX,
  AlertCircle,
  AlertTriangle,
  X
} from 'lucide-react';
import { Student, PROGRAMS, PACK_LABELS } from '../types';
import { ProgressBar } from '../components/ProgressBar';
import { formatSimpleDate, getExpiryLabel, getStatusOf, cn } from '../lib/utils';
import StudentDetailModal from '../components/StudentDetailModal';
import { db } from '../lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';

interface StudentsTabProps {
  students: Student[];
  onEdit: (s: Student) => void;
  showToast?: (msg: string) => void;
}

export default function StudentsTab({ students, onEdit, showToast = () => {} }: StudentsTabProps) {
  const [search, setSearch] = useState('');
  const [progFilter, setProgFilter] = useState('');
  const [packFilter, setPackFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'nopack'>('all');
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deletingStudent) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'students', deletingStudent.id));
      setDeletingStudent(null);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const stats = useMemo(() => {
    let total = students.length;
    let active = 0;
    let expired = 0;
    let noPack = 0;

    students.forEach(s => {
      const status = getStatusOf(s);
      if (status === 'ok' || status === 'warn' || status === 'crit') {
        active++;
      } else if (status === 'over') {
        expired++;
      } else if (status === 'none') {
        noPack++;
      }
    });

    return { total, active, expired, noPack };
  }, [students]);

  const filtered = useMemo(() => {
    return students.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
      const matchProg = !progFilter || s.prog === progFilter;
      const matchPack = !packFilter || String(s.pack) === packFilter;
      const status = getStatusOf(s);
      const matchStatus =
        statusFilter === 'all' ? true :
        statusFilter === 'active' ? (status === 'ok' || status === 'warn' || status === 'crit') :
        statusFilter === 'expired' ? status === 'over' :
        statusFilter === 'nopack' ? status === 'none' : true;
      return matchSearch && matchProg && matchPack && matchStatus;
    });
  }, [students, search, progFilter, packFilter, statusFilter]);

  const toggleStatusFilter = (val: 'active' | 'expired' | 'nopack') => {
    setStatusFilter(prev => prev === val ? 'all' : val);
  };

  // Group by program for a nicer list
  const groups = useMemo(() => {
    const g: Record<string, Student[]> = {};
    filtered.forEach(s => {
      if (!g[s.prog]) g[s.prog] = [];
      g[s.prog].push(s);
    });
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setStatusFilter('all')}
          className={cn(
            "card-lift bg-white p-6 rounded-3xl border shadow-sm flex items-center justify-between relative overflow-hidden group cursor-pointer",
            statusFilter === 'all' ? "border-sage-600 ring-2 ring-sage-600/10" : "border-warm-300"
          )}
        >
          <div className="space-y-1 relative z-10 text-left">
            <span className="text-[10px] font-bold text-sage-500 uppercase tracking-wider font-bold">Total Estudiantes</span>
            <div className="text-3xl font-serif font-black text-sage-900">{stats.total}</div>
            <p className="text-[10px] text-sage-400">Registrados en total</p>
          </div>
          <div className="w-12 h-12 bg-warm-100 text-sage-600 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
            <Users className="w-6 h-6" />
          </div>
        </motion.div>

        {/* Card 2: Active */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onClick={() => toggleStatusFilter('active')}
          className={cn(
            "card-lift bg-white p-6 rounded-3xl border shadow-sm flex items-center justify-between relative overflow-hidden group cursor-pointer",
            statusFilter === 'active' ? "border-green-500 ring-2 ring-green-500/10" : "border-warm-300"
          )}
        >
          <div className="space-y-1 relative z-10 text-left">
            <span className="text-[10px] font-bold text-sage-500 uppercase tracking-wider font-bold">Activos</span>
            <div className="text-3xl font-serif font-black text-green-600">{stats.active}</div>
            <p className="text-[10px] text-sage-400">Con paquete activo</p>
          </div>
          <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
            <UserCheck className="w-6 h-6" />
          </div>
        </motion.div>

        {/* Card 3: Expired */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => toggleStatusFilter('expired')}
          className={cn(
            "card-lift bg-white p-6 rounded-3xl border shadow-sm flex items-center justify-between relative overflow-hidden group cursor-pointer",
            statusFilter === 'expired' ? "border-red-500 ring-2 ring-red-500/10" : "border-warm-300"
          )}
        >
          <div className="space-y-1 relative z-10 text-left">
            <span className="text-[10px] font-bold text-sage-500 uppercase tracking-wider font-bold">Vencidos / Agotados</span>
            <div className="text-3xl font-serif font-black text-red-650 text-red-600">{stats.expired}</div>
            <p className="text-[10px] text-sage-400">Requieren renovación</p>
          </div>
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
            <AlertCircle className="w-6 h-6" />
          </div>
        </motion.div>

        {/* Card 4: No Pack */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onClick={() => toggleStatusFilter('nopack')}
          className={cn(
            "card-lift bg-white p-6 rounded-3xl border shadow-sm flex items-center justify-between relative overflow-hidden group cursor-pointer",
            statusFilter === 'nopack' ? "border-amber-500 ring-2 ring-amber-500/10" : "border-warm-300"
          )}
        >
          <div className="space-y-1 relative z-10 text-left">
            <span className="text-[10px] font-bold text-sage-500 uppercase tracking-wider font-bold">Sin Plan</span>
            <div className="text-3xl font-serif font-black text-amber-600">{stats.noPack}</div>
            <p className="text-[10px] text-sage-400">Sin paquete registrado</p>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
            <UserX className="w-6 h-6" />
          </div>
        </motion.div>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 md:p-6 rounded-3xl border border-warm-300 shadow-sm flex flex-wrap gap-4 items-center">
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

        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <select 
              value={progFilter}
              onChange={e => setProgFilter(e.target.value)}
              className="pl-4 pr-10 py-3 bg-warm-50 border border-warm-300 rounded-2xl appearance-none focus:ring-2 focus:ring-sage-600/10 outline-none text-sm font-medium text-sage-700"
            >
              <option value="">Todos los programas</option>
              {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-400" />
          </div>

          <div className="relative">
            <select 
              value={packFilter}
              onChange={e => setPackFilter(e.target.value)}
              className="pl-4 pr-10 py-3 bg-warm-50 border border-warm-300 rounded-2xl appearance-none focus:ring-2 focus:ring-sage-600/10 outline-none text-sm font-medium text-sage-700"
            >
              <option value="">Todos los paquetes</option>
              {Object.entries(PACK_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-400" />
          </div>
        </div>
      </div>

      {/* Table/List */}
      <div className="bg-white rounded-3xl shadow-sm border border-warm-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-warm-100/50">
                <th className="px-6 py-4 text-[10px] font-bold text-sage-500 uppercase tracking-widest">Estudiante</th>
                <th className="px-6 py-4 text-[10px] font-bold text-sage-500 uppercase tracking-widest">Programa</th>
                <th className="px-6 py-4 text-[10px] font-bold text-sage-500 uppercase tracking-widest">Paquete</th>
                <th className="px-6 py-4 text-[10px] font-bold text-sage-500 uppercase tracking-widest">Progreso</th>
                <th className="px-6 py-4 text-[10px] font-bold text-sage-500 uppercase tracking-widest">Estado</th>
                <th className="px-6 py-4 text-[10px] font-bold text-sage-500 uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200">
              {groups.map(([progTitle, studentsInProg]) => (
                <React.Fragment key={progTitle}>
                  <tr className="bg-sage-50/50">
                    <td colSpan={6} className="px-6 py-2">
                       <span className="text-[10px] font-black text-sage-600 uppercase tracking-[0.2em]">{progTitle}</span>
                       <span className="ml-2 text-[10px] font-medium text-sage-400 bg-white px-2 py-0.5 rounded-full border border-sage-100">{studentsInProg.length}</span>
                    </td>
                  </tr>
                  {studentsInProg.map(s => {
                    const expiry = getExpiryLabel(s);
                    const status = getStatusOf(s);
                    
                    return (
                      <tr key={s.id} className="hover:bg-warm-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              status === 'ok' ? 'bg-green-500' : status === 'warn' ? 'bg-amber-500' : status === 'none' ? 'bg-warm-300' : 'bg-red-500'
                            )} />
                            <div>
                              <div className="font-bold text-sage-900 text-sm">{s.name}</div>
                              {s.nota && <div className="text-[10px] text-sage-400 italic line-clamp-1 truncate max-w-[150px]">{s.nota}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-sage-500">{s.prog}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-1 rounded-lg border",
                            s.pack === 31 ? "bg-purple-50 text-purple-700 border-purple-100" : "bg-warm-100 text-sage-600 border-warm-200"
                          )}>
                            {PACK_LABELS[s.pack] || 'Manual'}
                          </span>
                        </td>
                        <td className="px-6 py-4"><ProgressBar student={s} /></td>
                        <td className="px-6 py-4"><span className={cn("text-[10px] font-bold px-2 py-1 rounded-lg", expiry.cls)}>{expiry.txt}</span></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => onEdit(s)}
                              className="p-2 md:p-1.5 bg-warm-100 md:bg-transparent hover:bg-sage-600 hover:text-white rounded-xl md:rounded-lg transition-all text-sage-600 md:text-sage-400 border border-warm-200 md:border-transparent"
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDetailStudent(s)}
                              className="p-2 md:p-1.5 bg-warm-100 md:bg-transparent hover:bg-sage-600 hover:text-white rounded-xl md:rounded-lg transition-all text-sage-600 md:text-sage-400 border border-warm-200 md:border-transparent"
                              title="Ver detalle"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeletingStudent(s)}
                              className="p-2 md:p-1.5 bg-warm-100 md:bg-transparent hover:bg-red-500 hover:text-white rounded-xl md:rounded-lg transition-all text-red-400 md:text-sage-400 border border-warm-200 md:border-transparent"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-20 text-center space-y-2">
              <Users className="w-12 h-12 text-warm-300 mx-auto" />
              <p className="text-sage-400 italic">No tienes estudiantes que coincidan con estos criterios.</p>
            </div>
          )}
        </div>
      </div>

      {/* Student Detail Modal */}
      <StudentDetailModal
        student={detailStudent}
        onClose={() => setDetailStudent(null)}
        onEdit={(s) => { setDetailStudent(null); onEdit(s); }}
        showToast={showToast}
      />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingStudent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-sage-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setDeletingStudent(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="font-bold text-sage-900 text-center text-lg mb-1">¿Eliminar estudiante?</h3>
              <p className="text-sm text-sage-500 text-center mb-1">
                Vas a eliminar a <span className="font-bold text-sage-800">{deletingStudent.name}</span>.
              </p>
              <p className="text-xs text-red-500 text-center mb-6">Esta acción no se puede deshacer.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeletingStudent(null)}
                  className="flex-1 py-2.5 rounded-xl border border-warm-300 text-sage-600 font-medium text-sm hover:bg-warm-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
