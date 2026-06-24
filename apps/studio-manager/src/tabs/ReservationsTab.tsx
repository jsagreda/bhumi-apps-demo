import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Smartphone, CheckCircle2, Clock } from 'lucide-react';
import { Student } from '../types';

interface ReservationsTabProps {
  students: Student[];
}

export default function ReservationsTab({ students }: ReservationsTabProps) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const q = query(collection(db, 'agendamientos'), where('estado', '==', 'activo'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.fecha >= today) {
          list.push({ id: doc.id, ...data });
        }
      });
      // Sort by date and time
      list.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
      setBookings(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return <div className="p-8 text-center text-sage-500">Cargando reservas...</div>;

  if (bookings.length === 0) return (
    <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-warm-200">
      <Smartphone className="w-12 h-12 mx-auto text-warm-300 mb-4" />
      <p className="text-sage-500 font-medium">No hay reservas activas desde la aplicación para los próximos días.</p>
    </div>
  );

  const grouped = bookings.reduce((acc, b) => {
    if (!acc[b.fecha]) acc[b.fecha] = [];
    acc[b.fecha].push(b);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-6">
      <div className="bg-sage-50 border border-sage-200 p-4 rounded-2xl flex items-start gap-4">
        <Smartphone className="w-6 h-6 text-sage-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-sage-900">Reservas desde la App</h3>
          <p className="text-xs text-sage-600 mt-1">Aquí aparecen todos los agendamientos activos hechos por los estudiantes. A medida que vayas tomando asistencia en la pestaña principal, estas reservas aparecerán marcadas como "Asistió".</p>
        </div>
      </div>

      {Object.keys(grouped).sort().map(fecha => {
        const dateObj = parseISO(fecha);
        return (
          <div key={fecha} className="bg-white rounded-2xl p-5 shadow-sm border border-warm-200">
            <h3 className="font-serif text-lg text-sage-800 mb-4 capitalize flex items-center gap-2">
              <Clock className="w-5 h-5 text-sage-400" />
              {format(dateObj, 'EEEE, d MMMM yyyy', { locale: es })}
            </h3>
            <div className="grid gap-3">
              {grouped[fecha].map(b => {
                const sessionKey = `${b.fecha}__${b.hora}`;
                const matchedStudent = students.find(s => s.name.toLowerCase() === b.userName.toLowerCase());
                const isChecked = matchedStudent ? (matchedStudent.fechas || []).includes(sessionKey) : false;

                return (
                  <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-warm-50 border border-warm-200 gap-4 transition-all">
                    <div>
                      <div className={`font-medium ${isChecked ? 'line-through text-sage-400' : 'text-sage-900'}`}>
                        {b.userName}
                      </div>
                      <div className="text-xs text-sage-500 mt-1.5 flex items-center gap-2">
                        <span className="bg-white px-2 py-1 rounded-md border border-warm-200 shadow-sm font-medium">{b.hora}</span>
                        <span>{b.programa}</span>
                      </div>
                      {b.userEmail && (
                        <div className="text-[11px] text-sage-400 mt-1">{b.userEmail}</div>
                      )}
                    </div>
                    <div>
                      {isChecked ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-sage-700 bg-sage-200/50 px-3 py-1.5 rounded-full border border-sage-200">
                          <CheckCircle2 className="w-4 h-4" /> Asistió
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-100 px-3 py-1.5 rounded-full border border-amber-200">
                          <Clock className="w-4 h-4" /> Pendiente
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
