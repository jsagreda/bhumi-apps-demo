import React from 'react';
import { motion } from 'motion/react';
import { Student } from '../types';
import { cn } from '../lib/utils';

const getProgColor = (pct: number) => {
  if (pct >= 100) return 'bg-red-500';
  if (pct >= 75) return 'bg-amber-500';
  return 'bg-sage-600';
};

const getProgTextCol = (pct: number) => {
  if (pct >= 100) return 'text-red-600';
  if (pct >= 75) return 'text-amber-600';
  return 'text-sage-600';
};

export function ProgressBar({ student }: { student: Student }) {
  if (student.pack === 31) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100 flex items-center gap-1">
          <span className="w-1 h-1 bg-purple-600 rounded-full animate-pulse"></span>
          {student.fechas?.length || 0} clases totales
        </span>
      </div>
    );
  }

  if (!student.pack) return <span className="text-[10px] text-sage-300 font-bold uppercase tracking-widest">— Sin paquete</span>;

  const used = student.fechas?.length || 0;
  const total = student.pack;
  const pct = Math.min(100, Math.round((used / total) * 100));

  return (
    <div className="flex items-center gap-3 w-full max-w-[140px]">
      <div className="flex-1 h-1.5 bg-warm-200 rounded-full overflow-hidden border border-warm-300/50">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          className={cn("h-full rounded-full transition-colors", getProgColor(pct))}
        />
      </div>
      <span className={cn("text-[11px] font-black tabular-nums min-w-[28px] text-right", getProgTextCol(pct))}>
        {used}/{total}
      </span>
    </div>
  );
}
