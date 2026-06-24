import React, { useState, useMemo } from 'react';
import { InventoryItem, Student, StoreSale } from '../types';
import { formatCurrency, formatDate } from '../lib/utils';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, increment } from 'firebase/firestore';
import { ShoppingCart, Package, AlertTriangle, Plus, Trash2, Receipt, Download, FileText } from 'lucide-react';
import { downloadCsv } from '../lib/exportCsv';
import { openReceipt } from '../lib/receipt';
import Modal from '../components/Modal';

interface StoreTabProps {
  inventory: InventoryItem[];
  students: Student[];
  sales: StoreSale[];
  showToast: (msg: string) => void;
  accounts: string[];
}

export default function StoreTab({ inventory, students, sales, showToast, accounts }: StoreTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'pos' | 'inventario' | 'ventas'>('pos');
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit/Create Product state
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodCost, setProdCost] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodMinStock, setProdMinStock] = useState('');

  // POS State
  const [cart, setCart] = useState<Array<{ item: InventoryItem; qty: number }>>([]);
  const [posCustomer, setPosCustomer] = useState(''); // Selected student ID or custom name
  const [posCustomName, setPosCustomName] = useState(''); // Text field for unregistered guests
  const [posMethod, setPosMethod] = useState<string>(accounts[0] ?? 'Efectivo');
  const [posNotes, setPosNotes] = useState('');

  // Last sale for colilla
  const [lastSaleData, setLastSaleData] = useState<{ id: string; customerName: string; items: StoreSale['items']; total: number; paymentMethod: string; notes?: string; date: string } | null>(null);

  // Cart totals
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, line) => sum + (line.item.price * line.qty), 0);
  }, [cart]);

  const handleOpenProductModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
      setProdName(item.name);
      setProdCost(item.cost.toString());
      setProdPrice(item.price.toString());
      setProdStock(item.stock.toString());
      setProdMinStock(item.minStock.toString());
    } else {
      setEditingItem(null);
      setProdName('');
      setProdCost('');
      setProdPrice('');
      setProdStock('');
      setProdMinStock('2');
    }
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || !prodCost || !prodPrice || !prodStock) {
      showToast("Completa todos los campos obligatorios.");
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: prodName.trim(),
        cost: Number(prodCost),
        price: Number(prodPrice),
        stock: Number(prodStock),
        minStock: Number(prodMinStock) || 0
      };

      if (editingItem) {
        await updateDoc(doc(db, 'inventory', editingItem.id), data);
        showToast("Producto actualizado.");
      } else {
        await addDoc(collection(db, 'inventory'), data);
        showToast("Producto creado.");
      }
      setProductModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast("Error al guardar el producto.");
    } finally {
      setSaving(false);
    }
  };

  // Cart Operations
  const addToCart = (item: InventoryItem) => {
    if (item.stock <= 0) {
      showToast(`¡El producto ${item.name} no tiene existencias!`);
      return;
    }

    setCart(prev => {
      const existing = prev.find(line => line.item.id === item.id);
      if (existing) {
        if (existing.qty >= item.stock) {
          showToast(`No puedes vender más de ${item.stock} unidades de este producto.`);
          return prev;
        }
        return prev.map(line => line.item.id === item.id ? { ...line, qty: line.qty + 1 } : line);
      }
      return [...prev, { item, qty: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => prev.filter(line => line.item.id !== itemId));
  };

  const updateCartQty = (itemId: string, qty: number, maxStock: number) => {
    if (qty <= 0) {
      removeFromCart(itemId);
      return;
    }
    if (qty > maxStock) {
      showToast(`Stock máximo disponible: ${maxStock}`);
      return;
    }
    setCart(prev => prev.map(line => line.item.id === itemId ? { ...line, qty } : line));
  };

  // POS Sale Confirmation
  const handleProcessSale = async () => {
    if (cart.length === 0) {
      showToast("El carrito está vacío.");
      return;
    }

    const customerName = posCustomer === 'guest' 
      ? posCustomName.trim() || 'Invitado' 
      : students.find(s => s.id === posCustomer)?.name || 'Cliente Genérico';

    setSaving(true);
    try {
      // 1. Log sale entry in storeSales collection
      const saleRef = await addDoc(collection(db, 'storeSales'), {
        date: serverTimestamp(),
        items: cart.map(line => ({
          itemId: line.item.id,
          name: line.item.name,
          qty: line.qty,
          price: line.item.price
        })),
        total: cartTotal,
        paymentMethod: posMethod,
        customerName,
        customerId: posCustomer && posCustomer !== 'guest' ? posCustomer : null,
        notes: posNotes.trim()
      });

      // 2. Reduce stock for each product in cart
      for (const line of cart) {
        await updateDoc(doc(db, 'inventory', line.item.id), {
          stock: increment(-line.qty)
        });
      }

      // 3. Register transaction in ledger (MOVIMIENTOS)
      const listItems = cart.map(line => `${line.qty}x ${line.item.name}`).join(', ');
      await addDoc(collection(db, 'transactions'), {
        date: new Date().toISOString().split('T')[0],
        type: 'ingreso',
        amount: cartTotal,
        method: posMethod,
        category: 'Tienda',
        description: `Venta Tienda: ${listItems} - ${customerName}`,
        refId: saleRef.id,
        createdBy: auth.currentUser?.email || 'Admin',
        createdAt: serverTimestamp()
      });

      const today = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' });
      setLastSaleData({
        id: saleRef.id,
        customerName,
        items: cart.map(line => ({ itemId: line.item.id, name: line.item.name, qty: line.qty, price: line.item.price })),
        total: cartTotal,
        paymentMethod: posMethod,
        notes: posNotes.trim() || undefined,
        date: today,
      });
      showToast("Venta procesada con éxito y stock descontado.");
      setCart([]);
      setPosNotes('');
      setPosCustomName('');
      setPosCustomer('');
    } catch (err) {
      console.error(err);
      showToast("Error al procesar la venta.");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenReceipt = (sale: StoreSale | typeof lastSaleData) => {
    if (!sale) return;
    const isSale = 'id' in sale && 'items' in sale;
    if (!isSale) return;
    const dateStr = typeof sale.date === 'string'
      ? sale.date
      : new Date(((sale.date as any).seconds ?? 0) * 1000).toLocaleDateString('es-CO');
    const docNum = `VTA-${String(sale.id).slice(-8).toUpperCase()}`;
    openReceipt({
      docNumber: docNum,
      date: dateStr,
      seller: auth.currentUser?.email?.replace('@demo-yoga.app', '') ?? 'Admin',
      customer: sale.customerName || 'Cliente Genérico',
      items: (sale.items || []).map(it => ({ name: it.name, qty: it.qty, price: it.price })),
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      notes: (sale as any).notes,
    });
  };

  const handleExportSales = () => {
    const sorted = [...sales].sort((a, b) => {
      const dA = typeof a.date === 'string' ? new Date(a.date).getTime() : ((a.date as any)?.seconds || 0) * 1000;
      const dB = typeof b.date === 'string' ? new Date(b.date).getTime() : ((b.date as any)?.seconds || 0) * 1000;
      return dB - dA;
    });
    const headers = ['Fecha', 'Cliente', 'Items', 'Total', 'Método de Pago', 'Notas'];
    const rows = sorted.map(s => [
      typeof s.date === 'string' ? s.date : new Date(((s.date as any).seconds ?? 0) * 1000).toISOString().slice(0, 10),
      s.customerName,
      (s.items || []).map(it => `${it.qty}x ${it.name}`).join(' | '),
      s.total,
      s.paymentMethod,
      (s as any).notes ?? '',
    ]);
    downloadCsv(`ventas-tienda.csv`, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Visual Subtabs Nav */}
      <div className="flex justify-between items-center border-b border-warm-200 pb-2">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveSubTab('pos')}
            className={`pb-2.5 font-bold text-sm tracking-wide transition-all border-b-2 cursor-pointer ${activeSubTab === 'pos' ? 'text-sage-900 border-sage-600 font-extrabold' : 'text-sage-400 border-transparent hover:text-sage-600'}`}
          >
            Terminal Punto de Venta (POS)
          </button>
          <button
            onClick={() => setActiveSubTab('inventario')}
            className={`pb-2.5 font-bold text-sm tracking-wide transition-all border-b-2 cursor-pointer ${activeSubTab === 'inventario' ? 'text-sage-900 border-sage-600 font-extrabold' : 'text-sage-400 border-transparent hover:text-sage-600'}`}
          >
            Inventario & Almacén
          </button>
          <button
            onClick={() => setActiveSubTab('ventas')}
            className={`pb-2.5 font-bold text-sm tracking-wide transition-all border-b-2 cursor-pointer ${activeSubTab === 'ventas' ? 'text-sage-900 border-sage-600 font-extrabold' : 'text-sage-400 border-transparent hover:text-sage-600'}`}
          >
            Historial de Ventas
          </button>
        </div>

        {activeSubTab === 'inventario' && (
          <button
            onClick={() => handleOpenProductModal()}
            className="bg-sage-600 hover:bg-sage-700 text-white px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all text-xs font-bold shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Nuevo Producto
          </button>
        )}
      </div>

      {/* POS TERMINAL TAB */}
      {activeSubTab === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Products Grid */}
          <div className="lg:col-span-8 space-y-4">
            <h3 className="text-base font-bold font-serif text-sage-900">Productos Disponibles</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {inventory.map(item => {
                const isLow = item.stock <= item.minStock;
                const isOut = item.stock <= 0;
                
                return (
                  <div 
                    key={item.id}
                    onClick={() => !isOut && addToCart(item)}
                    className={`animate-fadeUp bg-white p-4 rounded-2xl border transition-all duration-300 cursor-pointer select-none flex flex-col justify-between min-h-[140px] ${isOut ? 'opacity-40 border-warm-300 cursor-not-allowed bg-warm-50' : 'border-warm-300 hover:border-sage-600 hover:shadow-lg hover:-translate-y-1 active:translate-y-0 active:scale-[0.98]'}`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-1">
                        <h4 className="font-bold text-sm text-sage-900 line-clamp-2 leading-tight">{item.name}</h4>
                        {isLow && !isOut && <span title="Bajo Stock"><AlertTriangle className="w-4 h-4 text-orange shrink-0" /></span>}
                      </div>
                      <span className="text-xs text-sage-400 mt-1 block">Stock: {item.stock} u.</span>
                    </div>

                    <div className="flex justify-between items-end pt-3 border-t border-warm-100">
                      <span className="text-sm font-bold text-sage-900">{formatCurrency(item.price)}</span>
                      <span className="text-[10px] bg-sage-100 text-sage-600 font-extrabold px-1.5 py-0.5 rounded-md">Vender</span>
                    </div>
                  </div>
                );
              })}

              {inventory.length === 0 && (
                <div className="col-span-full py-16 text-center text-sage-400 italic bg-white rounded-3xl border border-dashed border-warm-300">
                  <Package className="w-12 h-12 text-warm-200 mx-auto mb-2" />
                  No hay productos en inventario. Visita "Inventario & Almacén" para crear uno.
                </div>
              )}
            </div>
          </div>

          {/* POS Cart Sidebar */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white p-6 rounded-3xl border border-warm-300 shadow-sm space-y-6 flex flex-col justify-between min-h-[500px]">
              <div>
                <div className="flex items-center gap-2 border-b border-warm-200 pb-3 mb-4">
                  <ShoppingCart className="w-5 h-5 text-sage-600" />
                  <h3 className="font-bold text-sage-900 font-serif">Detalle de Compra</h3>
                </div>

                {/* Cart Lines */}
                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  {cart.map(line => (
                    <div key={line.item.id} className="flex items-center justify-between gap-3 text-xs bg-warm-100 p-2.5 rounded-xl border border-warm-200">
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-sage-900 truncate block">{line.item.name}</span>
                        <span className="text-[10px] text-sage-400">{formatCurrency(line.item.price)} / u.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="number"
                          min="1"
                          max={line.item.stock}
                          value={line.qty}
                          onChange={e => updateCartQty(line.item.id, Number(e.target.value), line.item.stock)}
                          className="w-10 text-center bg-white border border-warm-300 rounded-md py-0.5 outline-none font-bold"
                        />
                        <button 
                          onClick={() => removeFromCart(line.item.id)}
                          className="text-sage-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {cart.length === 0 && (
                    <p className="text-center text-sage-400 italic text-xs py-8">El carrito está vacío. Haz click en un producto.</p>
                  )}
                </div>
              </div>

              {/* Checkout Form fields */}
              <div className="space-y-4 pt-4 border-t border-warm-200">
                {/* Customer select */}
                <div>
                  <label className="block text-[10px] font-bold text-sage-400 uppercase tracking-wider mb-1.5">Asociar Cliente / Estudiante</label>
                  <select
                    value={posCustomer}
                    onChange={e => setPosCustomer(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-warm-100 border border-warm-300 rounded-xl outline-none focus:ring-2 focus:ring-sage-600/10 font-medium"
                  >
                    <option value="">-- Cliente Genérico --</option>
                    <option value="guest">Invitado no registrado</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.prog})</option>)}
                  </select>
                </div>

                {posCustomer === 'guest' && (
                  <div>
                    <input 
                      type="text" 
                      placeholder="Nombre del Invitado..."
                      value={posCustomName}
                      onChange={e => setPosCustomName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-warm-100 border border-warm-300 rounded-xl outline-none focus:ring-2 focus:ring-sage-600/10"
                    />
                  </div>
                )}

                {/* Method */}
                <div>
                  <label className="block text-[10px] font-bold text-sage-400 uppercase tracking-wider mb-1.5">Medio de Pago</label>
                  <select
                    value={posMethod}
                    onChange={e => setPosMethod(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-warm-100 border border-warm-300 rounded-xl outline-none focus:ring-2 focus:ring-sage-600/10 font-medium"
                  >
                    {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <input 
                    type="text" 
                    placeholder="Observaciones / Detalle..."
                    value={posNotes}
                    onChange={e => setPosNotes(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-warm-100 border border-warm-300 rounded-xl outline-none focus:ring-2 focus:ring-sage-600/10"
                  />
                </div>

                {/* Total */}
                <div className="flex justify-between items-center py-2 px-1">
                  <span className="text-xs font-bold text-sage-400">Total a Pagar:</span>
                  <span className="text-xl font-bold text-sage-900">{formatCurrency(cartTotal)}</span>
                </div>

                {/* Checkout button */}
                <button
                  onClick={handleProcessSale}
                  disabled={saving || cart.length === 0}
                  className="w-full bg-sage-900 hover:bg-black text-white py-3 rounded-2xl text-xs font-bold tracking-widest uppercase transition-all shadow-md active:scale-95 disabled:opacity-40 cursor-pointer"
                >
                  {saving ? 'Procesando...' : 'Confirmar y Vender'}
                </button>

                {lastSaleData && cart.length === 0 && (
                  <button
                    onClick={() => handleOpenReceipt(lastSaleData)}
                    className="w-full border border-sage-600 text-sage-700 hover:bg-sage-50 py-2.5 rounded-2xl text-xs font-bold tracking-widest uppercase transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Receipt className="w-4 h-4" /> Generar Colilla
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INVENTORY MANAGER TAB */}
      {activeSubTab === 'inventario' && (
        <div className="bg-white rounded-3xl border border-warm-300 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-warm-200 text-sage-900 border-b border-warm-300 text-xs uppercase tracking-wider font-bold">
                  <th className="px-6 py-4">Producto</th>
                  <th className="px-6 py-4 text-right">Costo (Compra)</th>
                  <th className="px-6 py-4 text-right">Precio (Venta)</th>
                  <th className="px-6 py-4 text-center">Stock Mínimo</th>
                  <th className="px-6 py-4 text-center">Stock Actual</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-200 text-sage-900">
                {inventory.map(item => {
                  const isLow = item.stock <= item.minStock;
                  return (
                    <tr key={item.id} className="hover:bg-warm-100/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-sage-900">
                        <div className="flex items-center gap-2">
                          {isLow && <span title="Bajo Stock"><AlertTriangle className="w-4 h-4 text-orange" /></span>}
                          {item.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sage-500 font-medium">{formatCurrency(item.cost)}</td>
                      <td className="px-6 py-4 text-right text-sage-900 font-bold">{formatCurrency(item.price)}</td>
                      <td className="px-6 py-4 text-center text-sage-500 font-medium">{item.minStock} u.</td>
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${isLow ? 'bg-orange/10 text-orange' : 'bg-green-50 text-green-700'}`}>
                          {item.stock} unidades
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleOpenProductModal(item)}
                          className="px-3 py-1.5 text-xs font-bold border border-warm-300 text-sage-600 rounded-xl hover:bg-warm-100 transition-all cursor-pointer"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {inventory.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sage-400 italic">
                      <Package className="w-12 h-12 text-warm-200 mx-auto mb-2" />
                      No hay productos registrados en inventario.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SALES HISTORY TAB */}
      {activeSubTab === 'ventas' && (() => {
        const sorted = [...sales].sort((a, b) => {
          const dA = typeof a.date === 'string' ? new Date(a.date).getTime() : ((a.date as any)?.seconds || 0) * 1000;
          const dB = typeof b.date === 'string' ? new Date(b.date).getTime() : ((b.date as any)?.seconds || 0) * 1000;
          return dB - dA;
        });
        const totalVendido = sorted.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
        return (
          <div className="space-y-4">
            {sorted.length > 0 && (
              <div className="animate-fadeUp bg-gradient-to-r from-[#1a2a51] to-[#22376a] text-white rounded-2xl px-6 py-4 flex flex-wrap gap-4 items-center justify-between shadow-xl shadow-sage-900/10">
                <span className="text-xs font-bold text-white/60 uppercase tracking-wider">{sorted.length} venta{sorted.length !== 1 ? 's' : ''} registrada{sorted.length !== 1 ? 's' : ''}</span>
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleExportSales}
                    className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Exportar CSV
                  </button>
                  <div className="text-right">
                    <span className="text-[9px] text-white/50 uppercase tracking-widest block">Total histórico vendido</span>
                    <span className="text-base font-extrabold text-sage-800">{formatCurrency(totalVendido)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {sorted.map((sale, idx) => (
                <div key={sale.id} className={`card-lift animate-fadeUp bg-white p-5 rounded-3xl border border-warm-300 shadow-sm ${idx < 5 ? `d-${Math.min(idx + 1, 5)}` : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sage-600/10 to-sage-800/15 flex items-center justify-center text-sage-600 shrink-0">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="font-bold text-sm text-sage-900 block">{sale.customerName || 'Cliente Genérico'}</span>
                        <span className="text-[10px] text-sage-400">{formatDate(sale.date)} · {sale.paymentMethod}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleOpenReceipt(sale)}
                        className="flex items-center gap-1.5 text-xs font-bold text-sage-600 border border-sage-300 hover:bg-sage-50 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" /> Colilla
                      </button>
                      <span className="text-base font-extrabold text-sage-900">{formatCurrency(sale.total)}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-warm-100 flex flex-wrap gap-2">
                    {(sale.items || []).map((it, i) => (
                      <span key={i} className="text-[10px] font-semibold bg-warm-100 text-sage-700 border border-warm-200 px-2.5 py-1 rounded-full">
                        {it.qty}× {it.name} · {formatCurrency(it.price)}
                      </span>
                    ))}
                  </div>
                  {sale.notes && <p className="text-[10px] text-sage-400 mt-2 italic">{sale.notes}</p>}
                </div>
              ))}

              {sorted.length === 0 && (
                <div className="py-16 text-center text-sage-400 italic bg-white rounded-3xl border border-dashed border-warm-300">
                  <Receipt className="w-12 h-12 text-warm-200 mx-auto mb-2" />
                  Aún no hay ventas registradas en la tienda.
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Product Edit/Create Modal */}
      <Modal isOpen={productModalOpen} onClose={() => setProductModalOpen(false)} title={editingItem ? 'Editar Producto' : 'Crear Nuevo Producto'}>
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Nombre del Producto *</label>
            <input 
              type="text" 
              required
              value={prodName}
              onChange={e => setProdName(e.target.value)}
              placeholder="e.g. Inciesos Masala"
              className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Costo (Compra) *</label>
              <input 
                type="number" 
                required
                min="0"
                value={prodCost}
                onChange={e => setProdCost(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Precio (Venta) *</label>
              <input 
                type="number" 
                required
                min="0"
                value={prodPrice}
                onChange={e => setProdPrice(e.target.value)}
                placeholder="e.g. 12000"
                className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Stock Inicial *</label>
              <input 
                type="number" 
                required
                min="0"
                value={prodStock}
                onChange={e => setProdStock(e.target.value)}
                placeholder="e.g. 10"
                className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-sage-400 uppercase tracking-wider mb-2">Stock Mínimo (Alerta)</label>
              <input 
                type="number" 
                min="0"
                value={prodMinStock}
                onChange={e => setProdMinStock(e.target.value)}
                placeholder="e.g. 2"
                className="w-full px-4 py-3 bg-warm-50 border border-warm-300 rounded-2xl outline-none focus:ring-2 focus:ring-sage-600/10"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={() => setProductModalOpen(false)}
              className="px-6 py-3 border border-warm-300 rounded-xl text-sm font-bold text-sage-600 hover:bg-warm-100 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-sage-600 hover:bg-sage-700 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Guardando...' : 'Guardar Producto'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
