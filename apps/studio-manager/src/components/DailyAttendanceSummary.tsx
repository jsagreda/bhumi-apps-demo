import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp, Users, Clock } from 'lucide-react';
import { Student, SCHEDULE } from '../types';
import { cn } from '../lib/utils';

interface DailyAttendanceSummaryProps {
  date: string;
  students: Student[];
}

interface AttendanceEntry {
  student: Student;
  time: string;
  sessionKey: string;
}

export default function DailyAttendanceSummary({ date, students }: DailyAttendanceSummaryProps) {
  const [isOpen, setIsOpen] = useState(true);

  // Get all sessions for the given date across ALL programs and ALL students
  const dailyEntries = useMemo<AttendanceEntry[]>(() => {
    if (!date) return [];

    const entries: AttendanceEntry[] = [];

    students.forEach(student => {
      (student.fechas || []).forEach(key => {
        // A key can be "YYYY-MM-DD" or "YYYY-MM-DD__HH:MM am/pm"
        const datePartOfKey = key.split('__')[0];
        if (datePartOfKey === date) {
          const time = key.includes('__') ? key.split('__')[1] : 'Sin horario';
          entries.push({ student, time, sessionKey: key });
        }
      });
    });

    // Sort by time, then by student name
    return entries.sort((a, b) => {
      if (a.time !== b.time) return a.time.localeCompare(b.time);
      return a.student.name.localeCompare(b.student.name);
    });
  }, [date, students]);

  // Group by time slot
  const grouped = useMemo(() => {
    const g: Record<string, AttendanceEntry[]> = {};
    dailyEntries.forEach(e => {
      if (!g[e.time]) g[e.time] = [];
      g[e.time].push(e);
    });
    return Object.entries(g);
  }, [dailyEntries]);

  const uniqueStudentCount = useMemo(() => {
    return new Set(dailyEntries.map(e => e.student.id)).size;
  }, [dailyEntries]);

  const formatDate = (d: string) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    const names = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${day} de ${names[parseInt(m)]} ${y}`;
  };

  return (
    <div className="bg-white rounded-3xl border border-warm-300 shadow-sm overflow-hidden">
      {/* Toggle Header */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-warm-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-sage-900 text-white rounded-xl flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="font-bold text-sage-900 text-sm">
              Resumen del día — {formatDate(date)}
            </div>
            <div className="text-xs text-sage-500 mt-0.5">
              {uniqueStudentCount === 0
                ? 'Sin asistencias registradas'
                : `${uniqueStudentCount} estudiante${uniqueStudentCount !== 1 ? 's' : ''} · ${dailyEntries.length} sesión${dailyEntries.length !== 1 ? 'es' : ''}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {uniqueStudentCount > 0 && (
            <span className="bg-sage-900 text-white text-xs font-bold px-3 py-1 rounded-full">
              {uniqueStudentCount}
            </span>
          )}
          {isOpen ? (
            <ChevronUp className="w-5 h-5 text-sage-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-sage-400" />
          )}
        </div>
      </button>

      {/* Collapsible Content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-5">
              {dailyEntries.length === 0 ? (
                <div className="py-8 text-center text-sage-400 italic text-sm border-t border-warm-200">
                  No hay asistencias registradas para esta fecha.
                </div>
              ) : (
                <div className="border-t border-warm-200 pt-4 space-y-5">
                  {grouped.map(([time, entries]) => (
                    <div key={time}>
                      {/* Time slot header */}
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-3.5 h-3.5 text-sage-600" />
                        <span className="text-xs font-black text-sage-600 uppercase tracking-widest">
                          {time}
                        </span>
                        <span className="text-[10px] bg-sage-100 text-sage-500 px-2 py-0.5 rounded-full font-bold">
                          {entries.length} {entries.length === 1 ? 'estudiante' : 'estudiantes'}
                        </span>
                      </div>

                      {/* Students in this slot */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {entries.map(({ student }) => (
                          <div
                            key={student.id + time}
                            className="flex items-center gap-3 px-3 py-2 rounded-xl bg-warm-50 border border-warm-200"
                          >
                            <div className="w-7 h-7 rounded-lg bg-sage-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              {student.name.split(' ').slice(0, 2).map(x => x[0] || '').join('').toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-sage-900 truncate">{student.name}</div>
                              <div className="text-[10px] text-sage-400 truncate">{student.prog}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
