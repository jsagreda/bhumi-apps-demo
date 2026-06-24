import React, { useState } from 'react';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { motion } from 'motion/react';
import { LogIn, User, Lock, AlertCircle } from 'lucide-react';

export default function Login() {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !pass) {
      setError('Completa usuario y contraseña.');
      return;
    }

    const email = user.includes('@') ? user : `${user}@demo-yoga.app`;
    if (!email.endsWith('@demo-yoga.app')) {
      setError('Acceso restringido a instructores de Bhumi Yoga.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      const msgs: Record<string, string> = {
        'auth/user-not-found': 'Usuario no encontrado.',
        'auth/wrong-password': 'Contraseña incorrecta.',
        'auth/invalid-email': 'Usuario inválido.',
        'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
        'auth/invalid-credential': 'Usuario o contraseña incorrectos.',
      };
      setError(msgs[err.code] || 'Error al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sage-900 via-sage-900 to-sage-700 p-4 relative overflow-hidden">
      <div className="orb w-72 h-72 bg-sage-600 -top-20 -left-20" />
      <div className="orb w-96 h-96 bg-sage-800 bottom-0 right-0 d-2" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/95 backdrop-blur-md rounded-2xl border border-white/40 shadow-2xl p-8 text-center relative z-10 animate-fadeUp"
      >
        <img src="/logo.png" alt="Bhumi Yoga" className="h-16 mx-auto mb-6" />
        <h2 className="font-serif text-2xl text-sage-900 mb-1">Bhumi Yoga</h2>
        <p className="text-sm text-sage-600 mb-8 italic">Studio Manager · Acceso instructores</p>

        <form onSubmit={handleLogin} className="space-y-4 text-left">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-sage-600 uppercase tracking-wider ml-1">Usuario</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-200" />
              <input
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="ej: daniel"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-warm-300 rounded-xl focus:ring-2 focus:ring-sage-600/20 focus:border-sage-600 transition-all outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-sage-600 uppercase tracking-wider ml-1">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sage-200" />
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-warm-300 rounded-xl focus:ring-2 focus:ring-sage-600/20 focus:border-sage-600 transition-all outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-sage-600 text-white rounded-xl font-medium shadow-lg shadow-sage-600/20 hover:bg-sage-700 hover:-translate-y-0.5 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? 'Entrando...' : <><LogIn className="w-4 h-4" /> Entrar</>}
          </button>

          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </motion.div>
          )}
        </form>
      </motion.div>
    </div>
  );
}
