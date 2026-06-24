export type Student = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  prog: string;
  pack: number;
  inicio: string;
  fin: string;
  nota: string;
  fechas: string[];
  historialFechas?: string[];        // Historial archivado para estadísticas
  renovaciones?: Record<string, any>[];  // Log de cada renovación
};

export type AppTab = 'asistencia' | 'estudiantes' | 'paquetes' | 'insights' | 'horarios' | 'reservas';

export const SCHEDULE: Record<number, string[]> = {
  1: ['7:00 am', '8:15 am', '6:00 pm', '7:15 pm'],          // Lunes
  2: ['7:00 am', '8:15 am', '4:45 pm', '6:00 pm', '7:15 pm'], // Martes
  3: ['7:00 am', '8:15 am', '6:00 pm', '7:15 pm'],          // Miércoles
  4: ['7:00 am', '8:15 am', '4:45 pm', '6:00 pm', '7:15 pm'], // Jueves
  5: ['7:00 am', '8:15 am'],                               // Viernes
  6: ['8:00 am'],                                         // Sábado
};

export const PACK_LABELS: Record<number, string> = {
  1: 'Paquete 1',
  4: 'Paquete 4',
  6: 'Paquete 6',
  8: 'Paquete 8',
  12: 'Paquete 12',
  31: 'Ilimitado',
  0: 'Sin paquete'
};

export const PROGRAMS = [
  'Hatha Yoga',
  'Yoga principiantes',
  'Yoga Terapéutico',
  'Meditación'
];
