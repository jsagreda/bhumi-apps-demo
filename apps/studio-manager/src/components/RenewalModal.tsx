import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RefreshCw, Package, Calendar, Archive, CheckCircle2, AlertTriangle, CreditCard, DollarSign, Receipt } from 'lucide-react';
import { Student, PACK_LABELS } from '../types';
import { db, auth } from '../lib/firebase';
import { doc, updateDoc, arrayUnion, collection, addDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { format, addDays, parseISO } from 'date-fns';
import { cn, getExpiryLabel } from '../lib/utils';
import { openReceipt } from '../lib/receipt';

interface RenewalModalProps {
  student: Student | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export default function RenewalModal({ student, onClose, onSuccess }: RenewalModalProps) {
  const [pack, setPack] = useState(8);
  const [inicio, setInicio] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [fin, setFin] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [successData, setSuccessData] = useState<{ studentName: string; pack: number; amount: number; method: string; date: string } | null>(null);
  const [carryOverDates, setCarryOverDates] = useState<Set<string>>(new Set());

  // ERP integration state
  const [recordPayment, setRecordPayment] = useState(true);
  const [amount, setAmount] = useState('155000');
  const [method, setMethod] = useState<string>('Efectivo');
  const [packagePrices, setPackagePrices] = useState<Record<string, number>>({});

  // Load real prices from ERP config
  useEffect(() => {
    getDoc(doc(db, 'config', 'packagePrices'))
      .then(snap => { if (snap.exists()) setPackagePrices(snap.data() as Record<string, number>); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setAmount((packagePrices[String(pack)] ?? 0).toString());
  }, [pack, packagePrices]);

  useEffect(() => {
    if (student) {
      setPack(student.pack || 8);
      setInicio(format(new Date(), 'yyyy-MM-dd'));
      setFin('');
      setConfirmed(false);
      setSuccessData(null);
      setCarryOverDates(new Set());
    }
  }, [student]);

  if (!student) return null;

  const clasesToArchive = student.fechas?.length || 0;
  const expiry = getExpiryLabel(student);
  const excessClasses = student.pack > 0 && student.pack !== 31 ? Math.max(0, clasesToArchive - student.pack) : 0;
  const excessDates = excessClasses > 0 ? (student.fechas || []).slice(-excessClasses) : [];

  const handleRenew = async () => {
    if (!confirmed) { setConfirmed(true); return; }
    setLoading(true);
    try {
      // Dates that carry over to new package stay in fechas
      const keptDates = [...carryOverDates];
      const datesToArchive = (student.fechas || []).filter(d => !carryOverDates.has(d));

      const updateData: Record<string, any> = {
        pack,
        inicio,
        fechas: keptDates,
      };

      if (datesToArchive.length > 0) {
        updateData.historialFechas = arrayUnion(...datesToArchive);
        updateData.renovaciones = arrayUnion({
          fecha: format(new Date(), 'yyyy-MM-dd'),
          packAnterior: student.pack,
          clasesArchivadas: datesToArchive.length,
          clasesTransferidas: keptDates.length,
          packNuevo: pack,
        });
      }

      // Vigencia: ilimitado usa fecha manual, los demás 30 días automáticos
      if (pack === 31) {
        updateData.fin = fin || format(addDays(parseISO(inicio), 30), 'yyyy-MM-dd');
      } else {
        updateData.fin = format(addDays(parseISO(inicio), 30), 'yyyy-MM-dd');
      }

      await updateDoc(doc(db, 'students', student.id), updateData);

      // Integración ERP: registrar cobro en el libro mayor contable
      if (recordPayment && Number(amount) > 0) {
        await addDoc(collection(db, 'transactions'), {
          date: format(new Date(), 'yyyy-MM-dd'),
          type: 'ingreso',
          amount: Number(amount),
          method,
          category: 'Clases',
          description: `Renovación Paquete: ${PACK_LABELS[pack] || 'Sin paquete'} - ${student.name}`,
          refId: student.id,
          createdBy: auth.currentUser?.email || 'Admin',
          createdAt: serverTimestamp()
        });
      }

      onSuccess(`✓ Paquete de ${student.name} renovado · ${clasesToArchive} clases archivadas`);
      if (recordPayment && Number(amount) > 0) {
        const receiptData = { studentName: student.name, pack, amount: Number(amount), method, date: inicio };
        setSuccessData(receiptData);
        // Persist receipt in Firestore for ERP visibility
        addDoc(collection(db, 'receipts'), {
          type: 'package',
          docNumber: `MBR-${Date.now().toString(36).toUpperCase()}`,
          date: inicio,
          seller: auth.currentUser?.email || 'Admin',
          customer: student.name,
          items: [{ name: `${PACK_LABELS[pack] ?? 'Paquete'} · Membresía`, qty: 1, price: Number(amount) }],
          total: Number(amount),
          paymentMethod: method,
          studentId: student.id,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenColilla = () => {
    if (!successData) return;
    openReceipt({
      docNumber: `MBR-${Date.now().toString(36).toUpperCase()}`,
      date: successData.date,
      seller: auth.currentUser?.email?.replace('@demo-yoga.app', '') ?? 'Admin',
      customer: successData.studentName,
      items: [{ name: `${PACK_LABELS[successData.pack] ?? 'Paquete'} · Membresía Bhumi Yoga`, qty: 1, price: successData.amount }],
      total: successData.amount,
      paymentMethod: successData.method,
    });
  };

  return (
    <AnimatePresence>
      {student && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-sage-900/40 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-warm-300"
          >
            {/* Header */}
            <div className="bg-sage-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-base leading-tight">Renovar Paquete</h2>
                  <p className="text-white/60 text-xs">{student.name}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">

              {/* ── Pantalla de éxito con colilla ── */}
              {successData ? (
                <div className="space-y-5 py-2">
                  <div className="text-center space-y-3">
                    <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-8 h-8 text-green-600" />
                    </div>
                    <div>
                      <p className="font-bold text-sage-900 text-base">¡Renovación exitosa!</p>
                      <p className="text-sm text-sage-500 mt-1">
                        {successData.studentName} · {PACK_LABELS[successData.pack]}
                      </p>
                    </div>
                  </div>
                  <div className="bg-warm-50 border border-warm-200 rounded-xl p-4 text-xs space-y-1.5 text-sage-700">
                    <div className="flex justify-between"><span className="text-sage-400">Pago registrado</span><span className="font-bold">${successData.amount.toLocaleString('es-CO')}</span></div>
                    <div className="flex justify-between"><span className="text-sage-400">Medio</span><span className="font-bold">{successData.method}</span></div>
                    <div className="flex justify-between"><span className="text-sage-400">Fecha</span><span className="font-bold">{successData.date}</span></div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={onClose}
                      className="flex-1 py-2.5 bg-warm-100 text-sage-600 rounded-xl font-medium hover:bg-warm-200 transition-colors"
                    >
                      Cerrar
                    </button>
                    <button
                      onClick={handleOpenColilla}
                      className="flex-1 py-2.5 bg-sage-900 hover:bg-black text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
                    >
                      <Receipt className="w-4 h-4" /> Generar Colilla
                    </button>
                  </div>
                </div>
              ) : (
              <>
              {/* Estado actual */}
              <div className="bg-warm-50 border border-warm-200 rounded-xl p-4 space-y-2">
                <p className="text-[10px] font-black text-sage-500 uppercase tracking-widest">Estado actual</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-sage-900">{PACK_LABELS[student.pack] || 'Sin paquete'}</span>
                  <span className={cn('text-[10px] font-bold px-2 py-1 rounded-lg', expiry.cls)}>{expiry.txt}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-sage-500">
                  <Archive className="w-3.5 h-3.5" />
                  <span>{clasesToArchive} clase{clasesToArchive !== 1 ? 's' : ''} tomada{clasesToArchive !== 1 ? 's' : ''} se moverán al historial</span>
                </div>
              </div>

              {/* Carry-over de clases excedidas */}
              {excessClasses > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">
                    {excessClasses} clase{excessClasses !== 1 ? 's' : ''} excedida{excessClasses !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    El estudiante tomó más clases de las incluidas en su paquete. Selecciona las que quieras descontar del nuevo paquete:
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto pt-1">
                    {excessDates.map(date => (
                      <label key={date} className="flex items-center gap-2 text-xs cursor-pointer select-none py-1 px-2 rounded-lg hover:bg-amber-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={carryOverDates.has(date)}
                          onChange={e => {
                            setCarryOverDates(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(date); else next.delete(date);
                              return next;
                            });
                          }}
                          className="rounded border-amber-400 text-amber-600 focus:ring-amber-400/20"
                        />
                        <span className="font-bold text-sage-900">{date}</span>
                        <span className="text-amber-600 text-[10px]">→ se descontará del nuevo paquete</span>
                      </label>
                    ))}
                  </div>
                  {carryOverDates.size > 0 && (
                    <p className="text-[10px] text-amber-700 font-bold pt-1">
                      {carryOverDates.size} clase{carryOverDates.size !== 1 ? 's' : ''} se transferirá{carryOverDates.size !== 1 ? 'n' : ''} al nuevo paquete
                    </p>
                  )}
                </div>
              )}

              {/* Nuevo paquete */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-sage-600 uppercase tracking-widest flex items-center gap-1.5">
                  <Package className="w-3 h-3" /> Nuevo paquete
                </label>
                <select
                  value={pack}
                  onChange={e => { setPack(parseInt(e.target.value)); setConfirmed(false); }}
                  className="w-full px-3 py-2.5 bg-warm-50 border border-warm-300 rounded-xl focus:ring-2 focus:ring-sage-600/20 outline-none appearance-none font-medium text-sage-900"
                >
                  {Object.entries(PACK_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Fecha de inicio */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-sage-600 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" /> Fecha de inicio
                </label>
                <input
                  type="date"
                  value={inicio}
                  onChange={e => { setInicio(e.target.value); setConfirmed(false); }}
                  className="w-full px-3 py-2.5 bg-warm-50 border border-warm-300 rounded-xl focus:ring-2 focus:ring-sage-600/20 outline-none transition-all"
                />
              </div>

              {/* Fecha de vencimiento (solo ilimitado) */}
              {pack === 31 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-sage-600 uppercase tracking-widest flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" /> Vencimiento (plan ilimitado)
                  </label>
                  <input
                    type="date"
                    value={fin}
                    onChange={e => { setFin(e.target.value); setConfirmed(false); }}
                    className="w-full px-3 py-2.5 bg-warm-50 border border-warm-300 rounded-xl focus:ring-2 focus:ring-sage-600/20 outline-none transition-all"
                  />
                </div>
              )}

              {/* Integración contable (ERP) */}
              <div className="bg-sage-50 border border-sage-200 rounded-xl p-4 space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold text-sage-900 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={recordPayment}
                    onChange={e => setRecordPayment(e.target.checked)}
                    className="rounded border-warm-300 text-sage-600 focus:ring-sage-600/10"
                  />
                  <span>Registrar pago en caja contable (ERP)</span>
                </label>

                {recordPayment && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-sage-500 uppercase tracking-widest flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5 text-sage-600" /> Valor Cobrado
                      </label>
                      <input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-warm-300 rounded-lg text-xs font-bold outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-sage-500 uppercase tracking-widest flex items-center gap-1">
                        <CreditCard className="w-3.5 h-3.5 text-sage-600" /> Medio de Pago
                      </label>
                      <select
                        value={method}
                        onChange={e => setMethod(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 bg-white border border-warm-300 rounded-lg text-xs font-bold outline-none font-medium"
                      >
                        <option value="Efectivo">Efectivo</option>
                        <option value="Nubank">Nubank</option>
                        <option value="Bancolombia">Bancolombia</option>
                        <option value="Daviplata">Daviplata</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Banner de confirmación */}
              <AnimatePresence>
                {confirmed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 font-medium">
                      Se archivarán <strong>{clasesToArchive} clases</strong> al historial y el contador del paquete se reiniciará.
                      Presiona <strong>Confirmar Renovación</strong> para continuar.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Botones */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-warm-100 text-sage-600 rounded-xl font-medium hover:bg-warm-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRenew}
                  disabled={loading}
                  className={cn(
                    'flex-1 py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 shadow-lg',
                    confirmed ? 'bg-green-600 hover:bg-green-700 shadow-green-600/20' : 'bg-sage-900 hover:bg-black shadow-sage-900/20'
                  )}
                >
                  {loading ? (
                    'Procesando...'
                  ) : confirmed ? (
                    <><CheckCircle2 className="w-4 h-4" /> Confirmar Renovación</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" /> Renovar Paquete</>
                  )}
                </button>
              </div>
              </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
