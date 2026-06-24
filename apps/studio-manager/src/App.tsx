import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth, db, INSTRUCTOR_NAMES } from './lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, Plus, Search, ChevronRight, CheckCircle2, Users, Package, BarChart3, Clock, LayoutDashboard, Smartphone, Sparkles } from 'lucide-react';
import Login from './components/Login';
import { Student, AppTab } from './types';
import StudentModal from './components/StudentModal';
import RenewalModal from './components/RenewalModal';
import { format } from 'date-fns';

// Tabs
import AttendanceTab from './tabs/AttendanceTab';
import StudentsTab from './tabs/StudentsTab';
import PacksTab from './tabs/PacksTab';
import InsightsTab from './tabs/InsightsTab';
import ScheduleTab from './tabs/ScheduleTab';
import ReservationsTab from './tabs/ReservationsTab';

export default function App() {
  const [session, setSession] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>('asistencia');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [renewingStudent, setRenewingStudent] = useState<Student | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  
  // Shared state for navigation from Schedule to Attendance
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedTime, setSelectedTime] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setSession(user);
      setLoading(false);
      
      if (user) {
        // Fetch students
        const q = query(collection(db, 'students'), orderBy('name', 'asc'));
        return onSnapshot(q, (snapshot) => {
          const list: Student[] = [];
          snapshot.forEach(d => {
            const data = d.data();
            list.push({
              id: d.id,
              name: data.name || '',
              email: data.email || '',
              phone: data.phone || '',
              prog: data.prog || '',
              pack: data.pack || 0,
              inicio: data.inicio || '',
              fin: data.fin || '',
              nota: data.nota || '',
              fechas: Array.isArray(data.fechas) ? data.fechas : []
            });
          });
          setStudents(list);
        });
      }
    });
    return () => unsub();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogout = () => signOut(auth);

  if (loading) return (
    <div className="min-h-screen bg-warm-100 flex items-center justify-center">
      <div className="text-center space-y-4">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }} 
          transition={{ repeat: Infinity, duration: 2 }}
          className="w-16 h-16 bg-sage-600 rounded-2xl mx-auto shadow-xl shadow-sage-600/20 flex items-center justify-center"
        >
          <img src="/logo.png" alt="Logo" className="w-10 h-10 grayscale invert brightness-0 invert-100" style={{ filter: 'brightness(0) invert(1)' }} />
        </motion.div>
        <p className="font-serif text-sage-900 tracking-wide">Cargando calma...</p>
      </div>
    </div>
  );

  if (!session) return <Login />;

  const tabs: {id: AppTab, label: string, icon: any}[] = [
    { id: 'asistencia', label: 'Asistencia', icon: CheckCircle2 },
    { id: 'estudiantes', label: 'Estudiantes', icon: Users },
    { id: 'paquetes', label: 'Paquetes', icon: Package },
    { id: 'horarios', label: 'Horarios', icon: Clock },
    { id: 'reservas', label: 'Reservas App', icon: Smartphone },
    { id: 'insights', label: 'Insights', icon: Sparkles },
  ];

  const instructorName = INSTRUCTOR_NAMES[session.email || ''] || session.email?.split('@')[0] || 'Instructor';

  return (
    <div className="min-h-screen bg-warm-50 pb-20 md:pb-6">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-warm-200 sticky top-0 z-30 px-4 md:px-8 py-3 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br from-sage-600 to-sage-800 rounded-full opacity-10 blur-2xl pointer-events-none"></div>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Bhumi Yoga" className="h-10 w-auto" />
            <div className="block">
              <h1 className="font-serif text-xl text-sage-900 leading-tight">Bhumi Yoga</h1>
              <p className="text-[10px] text-sage-500 italic tracking-wide">Studio Manager Professional</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-warm-100 rounded-full border border-warm-200">
               <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
               <span className="text-xs font-medium text-sage-700">{instructorName}</span>
             </div>
             <button 
              onClick={() => { setEditingStudent(null); setModalOpen(true); }}
              className="bg-sage-600 hover:bg-sage-900 text-white p-2 md:px-4 md:py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-sage-600/10 active:scale-95"
             >
               <Plus className="w-5 h-5" />
               <span className="hidden md:inline font-medium">Estudiante</span>
             </button>
             <button onClick={handleLogout} className="p-2 text-sage-400 hover:text-red-500 transition-colors" title="Cerrar sesión">
               <LogOut className="w-5 h-5" />
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4 md:p-8">
        
        {/* Navigation Tabs - Desktop */}
        <div className="hidden md:flex items-center gap-1.5 mb-8 bg-warm-200/50 p-1.5 rounded-2xl w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-300 font-medium text-sm",
                activeTab === tab.id
                  ? "bg-white text-sage-900 shadow-sm border border-warm-300"
                  : "text-sage-500 hover:text-sage-700 hover:bg-warm-200"
              )}
            >
              <tab.icon className={cn("w-4 h-4", activeTab === tab.id ? "text-sage-600" : "")} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dynamic Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'asistencia' && (
              <AttendanceTab 
                students={students} 
                showToast={showToast} 
                initialDate={selectedDate}
                initialTime={selectedTime}
              />
            )}
            {activeTab === 'estudiantes' && (
              <StudentsTab 
                students={students} 
                onEdit={(s) => { setEditingStudent(s); setModalOpen(true); }}
                showToast={showToast}
              />
            )}
            {activeTab === 'paquetes' && (
              <PacksTab 
                students={students} 
                onEdit={(s) => { setEditingStudent(s); setModalOpen(true); }}
                onRenew={(s) => setRenewingStudent(s)}
              />
            )}
            {activeTab === 'insights' && <InsightsTab students={students} onEdit={(s) => { setEditingStudent(s); setModalOpen(true); }} />}
            {activeTab === 'horarios' && (
              <ScheduleTab 
                onSelect={(date, time) => {
                  setSelectedDate(date);
                  setSelectedTime(time);
                  setActiveTab('asistencia');
                }}
              />
            )}
            {activeTab === 'reservas' && <ReservationsTab students={students} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Sticky Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-warm-200 px-4 py-3 z-50 flex justify-between items-center bg-white/95 backdrop-blur-md">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              activeTab === tab.id ? "text-sage-600" : "text-sage-400"
            )}
          >
            <tab.icon className="w-5 h-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider">{tab.label.split(' ')[0]}</span>
          </button>
        ))}
      </nav>

      {/* Modal */}
      <StudentModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        student={editingStudent}
        onSuccess={showToast}
      />

      {/* Renewal Modal */}
      <RenewalModal
        student={renewingStudent}
        onClose={() => setRenewingStudent(null)}
        onSuccess={showToast}
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 bg-gradient-to-r from-sage-900 to-sage-700 text-white px-6 py-3 rounded-full shadow-2xl z-[100] flex items-center gap-3 border border-white/10"
          >
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { cn } from './lib/utils';
