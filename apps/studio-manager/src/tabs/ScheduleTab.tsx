import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, Info, CheckCircle2 } from 'lucide-react';
import { SCHEDULE } from '../types';
import { cn } from '../lib/utils';
import { startOfWeek, addDays, format, getDay } from 'date-fns';
import { es } from 'date-fns/locale';

interface ScheduleTabProps {
  onSelect?: (date: string, time: string) => void;
}

export default function ScheduleTab({ onSelect }: ScheduleTabProps) {
  const currentWeek = useMemo(() => {
    const today = new Date();
    // Get start of week (Monday)
    const mon = startOfWeek(today, { weekStartsOn: 1 });
    return Array.from({ length: 6 }).map((_, i) => addDays(mon, i));
  }, []);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl border border-warm-300 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="font-serif text-xl text-sage-900">Horario del Studio</h2>
          <p className="text-xs text-sage-500 mt-1">Haz clic en una clase para ir directamente a la toma de asistencia.</p>
        </div>
        
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-sage-100 border border-sage-300" />
            <span className="text-[10px] font-bold text-sage-500 uppercase tracking-widest">Clase Regular</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-purple-100 border border-purple-300" />
            <span className="text-[10px] font-bold text-sage-500 uppercase tracking-widest">Solo Mar / Jue</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {currentWeek.map((date) => {
          const dateStr = format(date, 'yyyy-MM-dd');
          const dateObj = new Date(dateStr + 'T12:00:00');
          const dow = dateObj.getDay(); 
          const slots = SCHEDULE[dow] || [];
          const isToday = dateStr === todayStr;
          
          return (
            <div 
              key={dateStr}
              className={cn(
                "rounded-2xl border overflow-hidden bg-white shadow-sm transition-all",
                isToday ? "border-sage-600 ring-2 ring-sage-600/10" : "border-warm-300"
              )}
            >
              <div className={cn(
                "p-3 text-center border-b",
                isToday ? "bg-sage-600 text-white" : "bg-warm-100 text-sage-900"
              )}>
                <div className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">
                  {format(date, 'EEEE', { locale: es })}
                </div>
                <div className="text-xs font-serif italic opacity-80">
                  {format(date, 'd MMMM', { locale: es })}
                </div>
              </div>

              <div className="p-3 space-y-2">
                {slots.length > 0 ? slots.map(time => {
                  const isSpecial = time === '4:45 pm'; // Based on previous logic
                  
                  return (
                    <motion.button
                      key={time}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onSelect?.(dateStr, time)}
                      className={cn(
                        "w-full py-2.5 px-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center justify-center gap-1.5",
                        isSpecial 
                          ? "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" 
                          : "bg-sage-50 text-sage-700 border-sage-100 hover:bg-sage-100"
                      )}
                    >
                      <Clock className="w-3 h-3 opacity-60" />
                      {time}
                    </motion.button>
                  );
                }) : (
                  <div className="py-8 text-center text-[10px] text-sage-300 italic">Sin clases agendadas</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
