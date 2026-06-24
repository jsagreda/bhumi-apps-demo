import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Check, 
  Calendar as CalendarIcon, 
  Clock as ClockIcon, 
  Search, 
  UserCheck, 
  ChevronDown,
  Filter,
  Save,
  Edit
} from 'lucide-react';
import { Student, PROGRAMS, SCHEDULE } from '../types';
import { db } from '../lib/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove, writeBatch } from 'firebase/firestore';
import { format, parseISO, getDay } from 'date-fns';
import { cn, formatSimpleDate, getExpiryLabel } from '../lib/utils';
import { useColombianHolidays } from '../hooks/useColombianHolidays';
import DailyAttendanceSummary from '../components/DailyAttendanceSummary';

interface AttendanceTabProps {
  students: Student[];
  showToast: (msg: string) => void;
  initialDate?: string;
  initialTime?: string;
}

const NO_HOURS: string[] = [];

export default function AttendanceTab({ students, showToast, initialDate, initialTime }: AttendanceTabProps) {
  const { holidays, getHolidayName } = useColombianHolidays();
  const [prog, setProg] = useState(''); // '' = todos los programas
  const [date, setDate] = useState(initialDate || format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(initialTime || '');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editPending, setEditPending] = useState<Record<string, boolean>>({});

  const sessionKey = time ? `${date}__${time}` : date;

  useEffect(() => {
    setEditMode(false);
    setEditPending({});
  }, [sessionKey]);

  const startEditMode = () => {
    const initialPending: Record<string, boolean> = {};
    students.forEach(s => {
      initialPending[s.id] = s.fechas?.includes(sessionKey) || false;
    });
    setEditPending(initialPending);
    setEditMode(true);
  };

  const toggleEditPending = (id: string) => {
    setEditPending(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const batch = writeBatch(db);
      let changesCount = 0;
      
      students.forEach(s => {
        const wasRegistered = s.fechas?.includes(sessionKey) || false;
        const isNowRegistered = !!editPending[s.id];
        
        if (wasRegistered !== isNowRegistered) {
          changesCount++;
          const studentRef = doc(db, 'students', s.id);
          if (isNowRegistered) {
            batch.update(studentRef, {
              fechas: arrayUnion(sessionKey)
            });
          } else {
            batch.update(studentRef, {
              fechas: arrayRemove(sessionKey)
            });
          }
        }
      });
      
      if (changesCount > 0) {
        await batch.commit();
        showToast(`Asistencias actualizadas: ${changesCount} cambios guardados`);
      } else {
        showToast("No se detectaron cambios");
      }
      setEditMode(false);
      setEditPending({});
    } catch (err) {
      console.error(err);
      showToast("Error al guardar correcciones");
    } finally {
      setSaving(false);
    }
  };

  const availableHours = useMemo(() => {
    if (!date || holidays.has(date)) return NO_HOURS;
    const dow = new Date(date + 'T12:00:00').getDay();
    return SCHEDULE[dow] ?? NO_HOURS;
  }, [date, holidays]);

  // If time is not in available hours, reset it
  useEffect(() => {
    if (availableHours.length > 0 && !availableHours.includes(time)) {
      setTime(availableHours[0]);
    } else if (availableHours.length === 0) {
      setTime('');
    }
  }, [availableHours]);


  const filteredStudents = useMemo(() => {
    return students
      .filter(s => 
        (prog === '' || s.prog === prog) && 
        (search === '' || s.name.toLowerCase().includes(search.toLowerCase()))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, prog, search]);

  const togglePending = (id: string) => {
    setPending(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleSave = async () => {
    const toRegister = Object.entries(pending).filter(([_, v]) => v).map(([id]) => id);
    if (toRegister.length === 0) return;

    setSaving(true);
    try {
      const batch = writeBatch(db);
      toRegister.forEach(id => {
        const student = students.find(s => s.id === id);
        if (student && !student.fechas?.includes(sessionKey)) {
          batch.update(doc(db, 'students', id), {
            fechas: arrayUnion(sessionKey)
          });
        }
      });
      await batch.commit();
      setPending({});
      showToast(`Asistencia de ${toRegister.length} estudiantes guardada`);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters Card */}
      <div className="bg-white p-6 rounded-3xl border border-warm-300 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-300" />
            <input 
              type="text" 
              placeholder="Buscar estudiante..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-warm-50 border border-warm-300 rounded-2xl focus:ring-2 focus:ring-sage-600/10 outline-none"
            />
          </div>
          
          <div className="flex flex-wrap gap-3">
             <div className="relative">
                <select 
                  value={prog}
                  onChange={e => setProg(e.target.value)}
                  className="pl-4 pr-10 py-2.5 bg-warm-50 border border-warm-300 rounded-2xl appearance-none focus:ring-2 focus:ring-sage-600/10 outline-none text-sm font-medium text-sage-900"
                >
                  <option value="">Todos los programas</option>
                  {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-400 pointer-events-none" />
             </div>


             <div className="flex items-center gap-2 bg-warm-50 border border-warm-300 rounded-2xl px-3 py-1">
                <CalendarIcon className="w-4 h-4 text-sage-400" />
                <input 
                  type="date" 
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="bg-transparent text-sm font-medium text-sage-900 outline-none py-1.5"
                />
             </div>

             {availableHours.length > 0 && (
               <div className="relative">
                  <select
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="pl-4 pr-10 py-2.5 bg-warm-50 border border-warm-300 rounded-2xl appearance-none focus:ring-2 focus:ring-sage-600/10 outline-none text-sm font-medium text-sage-900"
                  >
                    {availableHours.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <ClockIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-400 pointer-events-none" />
               </div>
             )}
             {date && holidays.has(date) && (
               <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
                 <span className="text-amber-600 text-base">🇨🇴</span>
                 <span className="text-xs font-bold text-amber-800">
                   Festivo: {getHolidayName(date)} · sin clases
                 </span>
               </div>
             )}
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className={cn(
        "flex flex-wrap justify-between items-center gap-4 p-4 rounded-2xl border transition-all",
        editMode 
          ? "bg-amber-50 border-amber-200" 
          : "bg-sage-50 border-sage-100"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all",
            editMode 
              ? "bg-amber-600 text-white shadow-amber-600/20" 
              : "bg-sage-600 text-white shadow-sage-600/20"
          )}>
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className={cn("font-bold text-sm", editMode ? "text-amber-900" : "text-sage-900")}>
              {editMode ? "Corrigiendo Asistencias" : (prog || "Todos los programas")}
            </h3>
            <p className={cn("text-xs", editMode ? "text-amber-700" : "text-sage-600")}>
              Sesión: {formatSimpleDate(date)} · {time || 'Sin horario'} {editMode ? "" : `· ${prog || 'Todos los programas'}`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {editMode ? (
            <>
              <button 
                onClick={() => {
                  setEditMode(false);
                  setEditPending({});
                }}
                disabled={saving}
                className="bg-warm-200 text-sage-700 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-warm-300 transition-all active:scale-95 disabled:opacity-30 cursor-pointer font-bold"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveEdit}
                disabled={saving}
                className="bg-amber-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-amber-700 transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2 shadow-lg shadow-amber-600/10 cursor-pointer font-bold"
              >
                {saving ? 'Guardando...' : <><Save className="w-4 h-4" /> Guardar Cambios</>}
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={startEditMode}
                disabled={saving}
                className="bg-white text-sage-705 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-warm-100 border border-warm-300 transition-all active:scale-95 flex items-center gap-2 cursor-pointer shadow-sm font-bold text-sage-700"
                title="Editar asistencias ya guardadas para este horario"
              >
                <Edit className="w-4 h-4 text-sage-500" />
                Corregir Asistencias
              </button>
              <button 
                onClick={handleSave}
                disabled={saving || Object.values(pending).filter(v => v).length === 0}
                className="bg-sage-900 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-black transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2 cursor-pointer font-bold"
              >
                {saving ? 'Guardando...' : <><Save className="w-4 h-4" /> Guardar Asistencia ({Object.values(pending).filter(v => v).length})</>}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Daily Summary */}
      <DailyAttendanceSummary date={date} students={students} />

      {/* List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {filteredStudents.map((s, idx) => {
            const isRegistered = s.fechas?.includes(sessionKey);
            const isPending = editMode ? !!editPending[s.id] : !!pending[s.id];
            const expiry = getExpiryLabel(s);
            
            const handleClick = () => {
              if (editMode) {
                toggleEditPending(s.id);
              } else {
                if (!isRegistered) {
                  togglePending(s.id);
                }
              }
            };
            
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                onClick={handleClick}
                className={cn(
                  "p-4 rounded-2xl border transition-all cursor-pointer group flex items-center gap-4",
                  editMode
                    ? isPending
                      ? "bg-sage-600 border-sage-700 text-white shadow-xl shadow-sage-600/20"
                      : "bg-white border-warm-300 hover:border-sage-400 hover:shadow-md"
                    : isRegistered
                      ? "bg-sage-100/50 border-sage-200 cursor-default opacity-80"
                      : isPending
                        ? "bg-sage-600 border-sage-700 text-white shadow-xl shadow-sage-600/20"
                        : "bg-white border-warm-300 hover:border-sage-400 hover:shadow-md"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                  editMode
                    ? isPending
                      ? "bg-white/20 text-white"
                      : "bg-warm-100 text-sage-400 group-hover:bg-warm-200"
                    : isRegistered
                      ? "bg-sage-200 text-sage-600"
                      : isPending
                        ? "bg-white/20 text-white"
                        : "bg-warm-100 text-sage-400 group-hover:bg-warm-200"
                )}>
                  {editMode
                    ? isPending 
                      ? <Check className="w-5 h-5 font-bold" /> 
                      : <div className="text-xs font-bold">{idx + 1}</div>
                    : isRegistered || isPending 
                      ? <Check className="w-5 h-5 font-bold" /> 
                      : <div className="text-xs font-bold">{idx + 1}</div>
                  }
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className={cn("font-bold text-sm truncate", isPending ? "text-white" : "text-sage-900")}>
                    {s.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md", isPending ? "bg-white/20 text-white" : expiry.cls)}>
                      {expiry.txt}
                    </span>
                    {s.nota && (
                      <span className={cn("text-[10px] italic truncate", isPending ? "text-white/70" : "text-sage-400")}>
                        ({s.nota})
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        
        {filteredStudents.length === 0 && (
          <div className="col-span-full py-12 text-center text-sage-400 italic bg-white rounded-3xl border border-dashed border-warm-400">
            No se encontraron estudiantes para los filtros actuales.
          </div>
        )}
      </div>
    </div>
  );
}
