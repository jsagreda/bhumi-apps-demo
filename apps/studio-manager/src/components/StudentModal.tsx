import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, User, BookOpen, Package, Calendar, FileText, 
  Save, AlertCircle, Trash2 
} from 'lucide-react';
import { Student, PROGRAMS, PACK_LABELS } from '../types';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { format, addDays, parseISO } from 'date-fns';

interface StudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  student?: Student | null;
  onSuccess: (msg: string) => void;
}

export default function StudentModal({ isOpen, onClose, student, onSuccess }: StudentModalProps) {
  const autoFin = (inicio: string) => {
    try { return format(addDays(parseISO(inicio), 30), 'yyyy-MM-dd'); } catch { return ''; }
  };

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    prog: PROGRAMS[0],
    pack: 8,
    inicio: format(new Date(), 'yyyy-MM-dd'),
    fin: autoFin(format(new Date(), 'yyyy-MM-dd')),
    nota: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (student) {
      const fin = student.fin || (student.inicio ? autoFin(student.inicio) : '');
      setFormData({
        name: student.name,
        email: student.email || '',
        phone: student.phone || '',
        prog: student.prog,
        pack: student.pack,
        inicio: student.inicio,
        fin,
        nota: student.nota || ''
      });
    } else {
      const today = format(new Date(), 'yyyy-MM-dd');
      setFormData({
        name: '',
        email: '',
        phone: '',
        prog: PROGRAMS[0],
        pack: 8,
        inicio: today,
        fin: autoFin(today),
        nota: ''
      });
    }
  }, [student, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    
    setLoading(true);
    try {
      if (student) {
        await updateDoc(doc(db, 'students', student.id), formData);
        onSuccess('Estudiante actualizado exitosamente');
      } else {
        await addDoc(collection(db, 'students'), {
          ...formData,
          fechas: []
        });
        onSuccess('Nuevo estudiante registrado');
      }
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-sage-900/40 backdrop-blur-sm p-4"
      >
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-warm-300"
        >
          <div className="flex items-center justify-between p-5 border-bottom border-warm-200">
            <h2 className="font-serif text-lg text-sage-900">
              {student ? 'Editar Estudiante' : 'Nuevo Estudiante'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-warm-100 rounded-full transition-colors text-sage-400">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSave} className="p-5 space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-sage-600 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                <User className="w-3 h-3" /> Nombre Completo
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Nombre Apellido"
                className="w-full px-4 py-2 bg-warm-50 border border-warm-300 rounded-xl focus:ring-2 focus:ring-sage-600/20 focus:border-sage-600 outline-none transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-sage-600 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                  <User className="w-3 h-3" /> Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  placeholder="estudiante@correo.com"
                  className="w-full px-4 py-2 bg-warm-50 border border-warm-300 rounded-xl focus:ring-2 focus:ring-sage-600/20 focus:border-sage-600 outline-none transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-sage-600 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                  <User className="w-3 h-3" /> Teléfono
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                  placeholder="+57 300 123 4567"
                  className="w-full px-4 py-2 bg-warm-50 border border-warm-300 rounded-xl focus:ring-2 focus:ring-sage-600/20 focus:border-sage-600 outline-none transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-sage-600 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                  <BookOpen className="w-3 h-3" /> Programa
                </label>
                <select
                  value={formData.prog}
                  onChange={e => setFormData({...formData, prog: e.target.value})}
                  className="w-full px-3 py-2 bg-warm-50 border border-warm-300 rounded-xl focus:ring-2 focus:ring-sage-600/20 focus:border-sage-600 outline-none appearance-none"
                >
                  {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-sage-600 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                  <Package className="w-3 h-3" /> Paquete
                </label>
                <select
                  value={formData.pack}
                  onChange={e => setFormData({...formData, pack: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 bg-warm-50 border border-warm-300 rounded-xl focus:ring-2 focus:ring-sage-600/20 focus:border-sage-600 outline-none appearance-none"
                >
                   {Object.entries(PACK_LABELS).map(([val, label]) => (
                     <option key={val} value={val}>{label}</option>
                   ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-sage-600 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" /> Fecha Inicio
                </label>
                <input
                  type="date"
                  value={formData.inicio}
                  onChange={e => {
                    const newInicio = e.target.value;
                    setFormData({...formData, inicio: newInicio, fin: autoFin(newInicio)});
                  }}
                  className="w-full px-3 py-2 bg-warm-50 border border-warm-300 rounded-xl focus:ring-2 focus:ring-sage-600/20 focus:border-sage-600 outline-none transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-sage-600 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" /> Vencimiento
                </label>
                <input
                  type="date"
                  value={formData.fin}
                  onChange={e => setFormData({...formData, fin: e.target.value})}
                  className="w-full px-3 py-2 bg-warm-50 border border-warm-300 rounded-xl focus:ring-2 focus:ring-sage-600/20 focus:border-sage-600 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-sage-600 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                <FileText className="w-3 h-3" /> Notas
              </label>
              <textarea
                value={formData.nota}
                onChange={e => setFormData({...formData, nota: e.target.value})}
                placeholder="Ej: Beca total, Lesión en rodilla..."
                className="w-full px-4 py-2 bg-warm-50 border border-warm-300 rounded-xl focus:ring-2 focus:ring-sage-600/20 focus:border-sage-600 outline-none transition-all min-h-[80px]"
              />
            </div>

            <div className="pt-4 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 bg-warm-200 text-sage-600 rounded-xl font-medium hover:bg-warm-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 bg-sage-600 text-white rounded-xl font-medium shadow-lg shadow-sage-600/10 hover:bg-sage-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? '...' : <><Save className="w-4 h-4" /> Guardar</>}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
