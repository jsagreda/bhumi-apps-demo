import React, { useState, useEffect } from 'react';
import { db, auth, INSTRUCTOR_NAMES } from './lib/firebase';
import { collection, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { Transaction, InventoryItem, Student, BhumiEvent, StoreSale, CashReconciliation } from './types';
import DashboardTab from './tabs/DashboardTab';
import FinanzasTab from './tabs/FinanzasTab';
import StoreTab from './tabs/StoreTab';
import InstructoresTab from './tabs/InstructoresTab';
import EventosTab from './tabs/EventosTab';
import EstudiantesTab from './tabs/EstudiantesTab';
import { LayoutDashboard, Wallet, ShoppingBag, Users, Calendar, LogOut, CheckCircle, Briefcase } from 'lucide-react';

const NAV_TABS = [
  { id: 'dashboard',     label: 'Dashboard',          shortLabel: 'Panel',    icon: LayoutDashboard },
  { id: 'estudiantes',   label: 'Estudiantes y Pagos', shortLabel: 'Alumnos',  icon: Users },
  { id: 'finanzas',      label: 'Libro Contable',      shortLabel: 'Finanzas', icon: Wallet },
  { id: 'store',         label: 'Bhumi Store & POS',   shortLabel: 'Tienda',   icon: ShoppingBag },
  { id: 'instructores',  label: 'Nómina Profesores',   shortLabel: 'Nómina',   icon: Briefcase },
  { id: 'eventos',       label: 'Eventos / Caja',      shortLabel: 'Eventos',  icon: Calendar },
] as const;

type TabId = typeof NAV_TABS[number]['id'];

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [events, setEvents] = useState<BhumiEvent[]>([]);
  const [sales, setSales] = useState<StoreSale[]>([]);
  const [reconciliations, setReconciliations] = useState<CashReconciliation[]>([]);
  const [accounts, setAccounts] = useState<string[]>(['Nubank', 'Bancolombia', 'Daviplata', 'Efectivo']);
  const [categories, setCategories] = useState<string[]>(['Clases','Tienda','Eventos','Nomina','Gastos_Fijos','Materiales','Prestamos','Otros']);
  const [packagePrices, setPackagePrices] = useState<Record<string,number>>({ '1': 33000, '4': 105000, '6': 90000, '8': 155000, '12': 175000, '31': 205000 });

  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;

    getDoc(doc(db, 'config', 'accounts')).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.accounts) && data.accounts.length > 0) {
          setAccounts(data.accounts);
        }
      }
    }).catch(() => {});

    getDoc(doc(db, 'config', 'categories')).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(data.categories);
        }
      }
    }).catch(() => {});

    getDoc(doc(db, 'config', 'packagePrices')).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (data && typeof data === 'object') {
          setPackagePrices(data as Record<string,number>);
        }
      }
    }).catch(() => {});

    const unsubTransactions = onSnapshot(collection(db, 'transactions'), (snap) => {
      const list: Transaction[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(list);
    });

    const unsubInventory = onSnapshot(collection(db, 'inventory'), (snap) => {
      const list: InventoryItem[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as InventoryItem));
      setInventory(list);
    });

    const unsubStudents = onSnapshot(collection(db, 'students'), (snap) => {
      const list: Student[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Student));
      setStudents(list);
    });

    const unsubEvents = onSnapshot(collection(db, 'events'), (snap) => {
      const list: BhumiEvent[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as BhumiEvent));
      setEvents(list);
    });

    const unsubSales = onSnapshot(collection(db, 'storeSales'), (snap) => {
      const list: StoreSale[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as StoreSale));
      setSales(list);
    });

    const unsubRecon = onSnapshot(collection(db, 'cashReconciliations'), (snap) => {
      const list: CashReconciliation[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as CashReconciliation));
      setReconciliations(list);
    });

    return () => {
      unsubTransactions();
      unsubInventory();
      unsubStudents();
      unsubEvents();
      unsubSales();
      unsubRecon();
    };
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      showToast("Sesión iniciada correctamente.");
    } catch (err: any) {
      console.error(err);
      setLoginError("Credenciales incorrectas o error de conexión.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      showToast("Sesión cerrada.");
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-sage-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-semibold text-sage-500">Cargando Portal Bhumi ERP...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f9e4dc] via-[#fdf8f5] to-[#e3eae8] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="orb w-96 h-96 bg-sage-600/15 -top-24 -left-20"></div>
          <div className="orb w-80 h-80 bg-sage-800/20 top-1/3 -right-20" style={{ animationDelay: '-4s' }}></div>
          <div className="orb w-72 h-72 bg-sage-400/20 -bottom-16 left-1/4" style={{ animationDelay: '-8s' }}></div>
        </div>
        <div className="w-full max-w-md bg-white/90 backdrop-blur-xl border border-white/60 rounded-3xl p-8 shadow-2xl shadow-sage-900/10 space-y-6 relative animate-fadeUp">
          <div className="text-center space-y-2">
            <div className="w-24 h-24 mx-auto flex items-center justify-center mb-1">
              <img src="/logo.png" alt="Bhumi Yoga Logo" className="max-h-full max-w-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-sage-900">Bhumi Yoga <span className="text-sage-600">ERP</span></h1>
            <p className="text-sm text-sage-800 font-medium italic">Administración consciente</p>
            <p className="text-xs text-sage-500 pt-1">Ingresa tus credenciales de administrador</p>
          </div>

          {loginError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl flex items-center gap-2">
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-sage-400 uppercase tracking-widest mb-1.5">Correo Electrónico</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="instructor@demo-yoga.app"
                className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-xl outline-none focus:ring-2 focus:ring-sage-600/10 text-sm font-medium"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-sage-400 uppercase tracking-widest mb-1.5">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-xl outline-none focus:ring-2 focus:ring-sage-600/10 text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-sage-600 hover:bg-sage-700 text-white py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all duration-300 shadow-lg shadow-sage-600/25 hover:shadow-xl hover:shadow-sage-600/30 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              Iniciar Sesión
            </button>
          </form>

          <div className="text-center pt-2">
            <span className="text-[10px] text-sage-400 font-medium">Desarrollado para Bhumi Yoga Academy</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-100 flex flex-col md:flex-row">

      {/* ── Desktop Sidebar (hidden on mobile) ── */}
      <aside className="hidden md:flex md:flex-col md:justify-between md:w-64 bg-gradient-to-b from-[#1a2a51] to-[#22376a] text-white md:shrink-0 relative overflow-hidden">
        <div className="orb w-48 h-48 bg-sage-800/15 -right-16 top-1/4 pointer-events-none"></div>
        <div className="relative">
          <div className="p-6 border-b border-white/10 flex items-center gap-3">
            <img src="/isotipo_blanco.png" alt="Isotipo Bhumi" className="w-10 h-10 object-contain opacity-90" />
            <div>
              <h1 className="font-bold text-sm leading-none text-white tracking-wide">Bhumi <span className="text-sage-800">Yoga</span></h1>
              <span className="text-[10px] text-white/50 font-bold uppercase tracking-[0.18em] mt-1 block">Administración</span>
            </div>
          </div>

          <nav className="p-4 space-y-1.5">
            {NAV_TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all duration-300 cursor-pointer relative ${isActive ? 'bg-white text-sage-900 shadow-lg' : 'text-white/60 hover:bg-white/10 hover:text-white hover:translate-x-0.5'}`}
                >
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-sage-600 rounded-r-full"></span>}
                  <Icon className={`w-4 h-4 ${isActive ? 'text-sage-600' : 'text-white/40'}`} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-white/10 space-y-4 relative">
          <div className="px-4 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sage-600 to-sage-800 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
              {(INSTRUCTOR_NAMES[user.email] || user.email || '?').substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] text-white/50 block">Usuario Activo</span>
              <span className="text-xs font-bold text-white truncate block max-w-full">
                {INSTRUCTOR_NAMES[user.email] || user.email}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 border border-white/15 rounded-2xl text-xs font-bold text-white/60 hover:bg-white/10 hover:text-white transition-all duration-300 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* ── Mobile Top Bar ── */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#1a2a51] to-[#22376a] text-white shrink-0 shadow-lg">
        <div className="flex items-center gap-2.5">
          <img src="/isotipo_blanco.png" alt="Isotipo Bhumi" className="w-7 h-7 object-contain opacity-90" />
          <div>
            <span className="font-bold text-sm text-white tracking-wide">Bhumi <span className="text-sage-800">ERP</span></span>
            <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest block leading-none mt-0.5">
              {NAV_TABS.find(t => t.id === activeTab)?.label}
            </span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-white/50 hover:text-white text-xs font-bold p-2 rounded-xl hover:bg-white/10 transition-all cursor-pointer"
          title="Cerrar sesión"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* ── Main Content ── */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto md:max-h-screen pb-24 md:pb-8">
        <div key={activeTab} className="animate-fadeUp">
          {activeTab === 'dashboard' && (
            <DashboardTab transactions={transactions} students={students} accounts={accounts} />
          )}
          {activeTab === 'estudiantes' && (
            <EstudiantesTab students={students} transactions={transactions} showToast={showToast} packagePrices={packagePrices} onPackagePricesChange={setPackagePrices} />
          )}
          {activeTab === 'finanzas' && (
            <FinanzasTab transactions={transactions} showToast={showToast} accounts={accounts} onAccountsChange={setAccounts} categories={categories} onCategoriesChange={setCategories} />
          )}
          {activeTab === 'store' && (
            <StoreTab inventory={inventory} students={students} sales={sales} showToast={showToast} accounts={accounts} />
          )}
          {activeTab === 'instructores' && (
            <InstructoresTab students={students} transactions={transactions} showToast={showToast} />
          )}
          {activeTab === 'eventos' && (
            <EventosTab events={events} students={students} transactions={transactions} reconciliations={reconciliations} showToast={showToast} />
          )}
        </div>
      </main>

      {/* ── Mobile Bottom Navigation ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#1a2a51] border-t border-white/10 shadow-2xl">
        <div className="flex">
          {NAV_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-all cursor-pointer relative ${isActive ? 'text-white' : 'text-white/35 active:text-white/70'}`}
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-sage-800 rounded-b-full" />
                )}
                <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-sage-800' : ''}`} />
                <span className={`text-[8.5px] font-bold uppercase tracking-wide leading-none ${isActive ? 'text-white' : 'text-white/40'}`}>
                  {tab.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-[76px] md:bottom-6 right-4 md:right-6 bg-gradient-to-r from-[#1a2a51] to-[#22376a] border border-sage-800/40 text-white px-5 py-3.5 rounded-2xl shadow-2xl shadow-sage-900/30 z-[60] flex items-center gap-2.5 animate-toastIn">
          <CheckCircle className="w-5 h-5 text-sage-800 shrink-0" />
          <span className="text-xs font-bold">{toast}</span>
        </div>
      )}
    </div>
  );
}
