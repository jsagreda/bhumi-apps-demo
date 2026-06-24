import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Calendar, Trash2, Edit2, Clock, BookOpen, TrendingUp, AlertTriangle
} from 'lucide-react';
import { Student, PACK_LABELS } from '../types';
import { db } from '../lib/firebase';
import { doc, updateDoc, arrayRemove } from 'firebase/firestore';
import { cn, formatSimpleDate, getExpiryLabel, getStatusOf, getInitials } from '../lib/utils';

interface StudentDetailModalProps {
  student: Student | null;
  onClose: () => void;
  onEdit: (s: Student) => void;
  showToast: (msg: string) => void;
}

function parseSessionKey(key: string): { date: string; time: string } {
  const parts = key.split('__');
  return { date: parts[0] || key, time: parts[1] || '' };
}

export default function StudentDetailModal({ student, onClose, onEdit, showToast }: StudentDetailModalProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!student) return null;

  const sortedFechas = [...(student.fechas || [])].sort((a, b) => b.localeCompare(a));
  const expiry = getExpiryLabel(student);
  const status = getStatusOf(student);
  const remaining = student.pack && student.pack !== 31 ? Math.max(0, student.pack - student.fechas.length) : null;

  const statusColor = {
    ok: 'bg-green-100 text-green-700',
    warn: 'bg-amber-100 text-amber-700',
    crit: 'bg-red-100 text-red-700',
    over: 'bg-red-100 text-red-700',
    none: 'bg-warm-200 text-sage-600',
  }[status] || 'bg-warm-200 text-sage-600';

  const handleDelete = async (key: string) => {
    setDeleting(true);
    try {
      await updateDoc(doc(db, 'students', student.id), {
        fechas: arrayRemove(key)
      });
      showToast('Clase eliminada del historial');
      setConfirmDelete(null);
    } catch (e) {
      console.error(e);
      showToast('Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {student && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          />

          {/* Side Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-sage-900 text-white p-6 flex-shrink-0">
              <div className="flex items-start justify-between mb-4">
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <button
                  onClick={() => { onClose(); onEdit(student); }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Editar
                </button>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center text-xl font-bold flex-shrink-0">
                  {getInitials(student.name)}
                </div>
                <div>
                  <h2 className="text-xl font-bold leading-tight">{student.name}</h2>
                  <p className="text-white/70 text-sm mt-0.5">{student.prog}</p>
                  {student.nota && (
                    <p className="text-white/50 text-xs italic mt-1">{student.nota}</p>
                  )}
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3 mt-5">
                <div className="bg-white/10 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold">{student.fechas.length}</div>
                  <div className="text-[10px] text-white/60 uppercase tracking-wider mt-0.5">Clases</div>
                </div>
                <div className="bg-white/10 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold">{remaining !== null ? remaining : '∞'}</div>
                  <div className="text-[10px] text-white/60 uppercase tracking-wider mt-0.5">Restantes</div>
                </div>
                <div className={cn('rounded-xl p-3 text-center', statusColor)}>
                  <div className="text-xs font-bold leading-tight">{expiry.txt}</div>
                  <div className="text-[10px] uppercase tracking-wider mt-0.5 opacity-70">Estado</div>
                </div>
              </div>
            </div>

            {/* Attendance History */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="w-4 h-4 text-sage-600" />
                  <h3 className="font-bold text-sage-900 text-sm uppercase tracking-wider">
                    Historial de asistencias
                  </h3>
                  <span className="ml-auto text-[10px] bg-sage-100 text-sage-600 px-2 py-0.5 rounded-full font-bold">
                    {sortedFechas.length} clases
                  </span>
                </div>

                {sortedFechas.length === 0 ? (
                  <div className="py-12 text-center text-sage-400 italic text-sm">
                    Este estudiante no tiene clases registradas.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedFechas.map((key, idx) => {
                      const { date, time } = parseSessionKey(key);
                      const isConfirming = confirmDelete === key;

                      return (
                        <motion.div
                          key={key}
                          layout
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 30 }}
                          transition={{ delay: idx * 0.02 }}
                          className={cn(
                            'rounded-xl border transition-all overflow-hidden',
                            isConfirming
                              ? 'border-red-200 bg-red-50'
                              : 'border-warm-200 bg-warm-50 hover:bg-white hover:border-warm-300'
                          )}
                        >
                          <div className="flex items-center gap-3 p-3">
                            <div className="w-8 h-8 rounded-lg bg-sage-100 flex items-center justify-center flex-shrink-0">
                              <Calendar className="w-4 h-4 text-sage-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-sage-900">
                                {formatSimpleDate(date)}
                              </div>
                              {time && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <Clock className="w-3 h-3 text-sage-400" />
                                  <span className="text-xs text-sage-500">{time}</span>
                                </div>
                              )}
                            </div>
                            {!isConfirming ? (
                              <button
                                onClick={() => setConfirmDelete(key)}
                                className="p-1.5 rounded-lg text-sage-300 hover:text-red-500 hover:bg-red-50 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ) : null}
                          </div>

                          {/* Confirmation Panel */}
                          <AnimatePresence>
                            {isConfirming && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="border-t border-red-200 px-3 py-3 bg-red-50"
                              >
                                <div className="flex items-start gap-2 mb-3">
                                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                  <p className="text-xs text-red-700 font-medium">
                                    ¿Eliminar la clase del <strong>{formatSimpleDate(date)}{time ? ` a las ${time}` : ''}</strong>? Esta acción no se puede deshacer.
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="flex-1 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={() => handleDelete(key)}
                                    disabled={deleting}
                                    className="flex-1 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
                                  >
                                    {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
