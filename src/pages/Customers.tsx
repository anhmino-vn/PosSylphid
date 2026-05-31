import React, { useEffect, useState, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  where,
  getDocs,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { db, Customer, Order } from '../lib/firebase';
import { 
  Users, 
  Search, 
  Phone, 
  Mail, 
  MapPin, 
  History,
  MoreVertical,
  Plus,
  Loader2,
  X,
  CheckCircle2,
  TrendingUp,
  Award,
  ChevronRight,
  ShoppingBag,
  ExternalLink,
  Edit2,
  Trash2,
  Calendar,
  ClipboardList,
  Package,
  Sparkles,
  Clock,
  Download
} from 'lucide-react';
import { formatDate, formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../App';

import { DateFilter, DateRange } from '../components/DateFilter';
import { startOfMonth, endOfDay } from 'date-fns';

import { useNavigate, useLocation } from 'react-router-dom';

export function Customers() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.action === 'create') {
      setIsModalOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ startDate: null, endDate: null });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOrderNow, setCreateOrderNow] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [actionMenuCustomer, setActionMenuCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{isOpen: boolean, customer: Customer | null, isBulk?: boolean}>({ isOpen: false, customer: null });
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [customerHistoryFilter, setCustomerHistoryFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [viewingOrder, setViewingOrder] = useState<Order | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'orders'), snap => {
        setAllOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)).filter(o => !o.deletedAt));
    });
    return unsubscribe;
  }, []);

  const handleSyncCRM = async () => {
    if (!window.confirm('Hệ thống sẽ đồng bộ lại toàn bộ dữ liệu mua sắm của khách hàng từ module đơn hàng. (Có thể mất thời gian). Bạn có chắc chắn?')) return;
    setSyncing(true);
    try {
      const ordersSnap = await getDocs(collection(db, 'orders'));
      const activeOrders = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)).filter(o => !o.deletedAt && o.status === 'paid');
      
      const customerDataMap = new Map<string, { totalSpend: number; orderCount: number; lastPurchaseDate: any }>();
      for (const order of activeOrders) {
         if (order.customerId) {
            const current = customerDataMap.get(order.customerId) || { totalSpend: 0, orderCount: 0, lastPurchaseDate: order.createdAt };
            const odTime = order.createdAt?.toDate ? order.createdAt.toDate().getTime() : 0;
            const curTime = current.lastPurchaseDate?.toDate ? current.lastPurchaseDate.toDate().getTime() : 0;
            const newLastPurchaseDate = odTime > curTime ? order.createdAt : current.lastPurchaseDate;
            
            customerDataMap.set(order.customerId, {
               totalSpend: current.totalSpend + (order.totalAmount || 0),
               orderCount: current.orderCount + 1,
               lastPurchaseDate: newLastPurchaseDate
            });
         }
      }

      const customersSnap = await getDocs(collection(db, 'customers'));
      const updatePromises = customersSnap.docs.map(cDoc => {
         const data = customerDataMap.get(cDoc.id) || { totalSpend: 0, orderCount: 0, lastPurchaseDate: null as any };
         return updateDoc(doc(db, 'customers', cDoc.id), {
            totalSpend: data.totalSpend,
            orderCount: data.orderCount,
            ...(data.lastPurchaseDate ? { lastPurchaseDate: data.lastPurchaseDate } : {})
         });
      });
      await Promise.all(updatePromises);
      
      // Re-fetch transactions
      const txSnap = await getDocs(collection(db, 'customer_transactions'));
      const deleteTxPromises = txSnap.docs.map(tDoc => deleteDoc(doc(db, 'customer_transactions', tDoc.id)));
      await Promise.all(deleteTxPromises);
      
      const addTxPromises = activeOrders.filter(o => o.customerId).map(order => {
          const itemsOverview = order.items?.map((i: any) => i.name).join(', ') || '';
          return addDoc(collection(db, 'customer_transactions'), {
              customerId: order.customerId,
              orderId: order.id,
              totalAmount: order.totalAmount,
              status: order.status,
              orderDate: order.createdAt || serverTimestamp(),
              itemsOverview: itemsOverview,
              createdBy: 'System Sync'
          });
      });
      await Promise.all(addTxPromises);
      
      toast.success('Đồng bộ dữ liệu CRM thành công!');
    } catch (e) {
      console.error(e);
      toast.error('Lỗi trong quá trình đồng bộ!');
    } finally {
      setSyncing(false);
    }
  };
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [formData, setFormData] = useState<Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'lastPurchaseDate'> & { referredById?: string }>({
    name: '',
    phone: '',
    email: '',
    address: '',
    gender: '',
    birthDate: '',
    note: '',
    status: 'active',
    inChargeStaff: '',
    totalSpend: 0,
    orderCount: 0,
    tier: 'bronze',
    referredById: ''
  });

  const [referrerSearchTerm, setReferrerSearchTerm] = useState('');
  const [isReferrerDropdownOpen, setIsReferrerDropdownOpen] = useState(false);
  const referrerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
     const handleClickOutside = (event: MouseEvent) => {
        if (referrerDropdownRef.current && !referrerDropdownRef.current.contains(event.target as Node)) {
           setIsReferrerDropdownOpen(false);
        }
     };
     document.addEventListener('mousedown', handleClickOutside);
     return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const canEdit = profile?.role === 'admin' || profile?.permissions?.customers?.edit;

  const [rawCustomers, setRawCustomers] = useState<Customer[]>([]);

  const filteredReferrers = useMemo(() => {
     if (!isModalOpen) return [];
     let filtered = rawCustomers;
     if (referrerSearchTerm) {
        const term = referrerSearchTerm.toLowerCase();
        filtered = rawCustomers.filter(c => 
           (c.name && c.name.toLowerCase().includes(term)) || 
           (c.phone && c.phone.includes(term)) ||
           (c.id && c.id.toLowerCase().includes(term))
        );
     }
     
     const unique = new Map<string, any>();
     filtered.forEach(c => {
         const key = (c.phone || '').trim() || c.id;
         if (!unique.has(key) && c.id !== editingId) { // cannot refer itself
             unique.set(key, c);
         }
     });
     return Array.from(unique.values()).slice(0, 50);
  }, [rawCustomers, referrerSearchTerm, editingId, isModalOpen]);

  useEffect(() => {
    const q = query(collection(db, 'customers'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeCustomers = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Customer))
        .filter((c: any) => c.status !== 'inactive' && !c.deletedAt && !c.deleted_at && !c.hidden);
        
      const unique = new Map<string, Customer>();
      activeCustomers.forEach(c => {
         const key = (c.phone || '').trim() || c.id!;
         if (!unique.has(key)) {
             unique.set(key, c);
         }
      });
      setRawCustomers(Array.from(unique.values()));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
     setCustomers([...rawCustomers].sort((a, b) => {
        const spendA = allOrders.filter(o => o.customerId === a.id && o.status !== 'cancelled').reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const spendB = allOrders.filter(o => o.customerId === b.id && o.status !== 'cancelled').reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        return spendB - spendA;
     }));
  }, [rawCustomers, allOrders]);

  useEffect(() => {
     if (!selectedCustomer) {
       setCustomerOrders([]);
       return;
     }

     const updateCustomerOrders = () => {
         const cOrders = getFilteredOrders(selectedCustomer.id).sort((a,b) => {
             const tA = a.createdAt?.toDate ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
             const tB = b.createdAt?.toDate ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
             return tB - tA;
         });
         setCustomerOrders(cOrders);
     };

     updateCustomerOrders();
  }, [selectedCustomer, allOrders, dateRange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Validate Duplicate Phone & Email
      if (formData.phone) {
        const phoneQ = query(collection(db, 'customers'), where('phone', '==', formData.phone));
        const phoneSnap = await getDocs(phoneQ);
        const duplicatePhone = phoneSnap.docs.find(d => {
          const data = d.data();
          return d.id !== editingId && data.status !== 'inactive' && !data.deletedAt && !data.deleted_at && !data.hidden;
        });
        if (duplicatePhone) {
          toast.error('Số điện thoại này đã tồn tại trong hệ thống!');
          setLoading(false);
          return;
        }
      }

      if (formData.email) {
        const emailQ = query(collection(db, 'customers'), where('email', '==', formData.email));
        const emailSnap = await getDocs(emailQ);
        const duplicateEmail = emailSnap.docs.find(d => {
          const data = d.data();
          return d.id !== editingId && data.status !== 'inactive' && !data.deletedAt && !data.deleted_at && !data.hidden;
        });
        if (duplicateEmail) {
          toast.error('Email này đã tồn tại trong hệ thống!');
          setLoading(false);
          return;
        }
      }

      if (editingId) {
        const batch = writeBatch(db);
        const customerRef = doc(db, 'customers', editingId);
        batch.update(customerRef, {
          ...formData,
          status: formData.status || 'active',
          updatedAt: serverTimestamp()
        });

        const ordersQ = query(collection(db, 'orders'), where('customerId', '==', editingId));
        const ordersSnap = await getDocs(ordersQ);
        ordersSnap.docs.forEach(docSnap => {
           batch.update(docSnap.ref, {
               customerName: formData.name,
               customerPhone: formData.phone || '',
               updatedAt: serverTimestamp()
           });
        });

        await batch.commit();
      } else {
        const docRef = await addDoc(collection(db, 'customers'), {
          ...formData,
          status: 'active',
          totalSpend: 0,
          orderCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        
        if (createOrderNow) {
           navigate('/orders', { state: { autoCreateOrderForCustomer: docRef.id } });
        }
      }
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      alert('Lỗi khi lưu thông tin khách hàng!');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      address: '',
      gender: '',
      birthDate: '',
      note: '',
      status: 'active',
      totalSpend: 0,
      orderCount: 0,
      tier: 'bronze',
      referredById: ''
    });
    setReferrerSearchTerm('');
    setEditingId(null);
    setCreateOrderNow(false);
  };

  const openEdit = (customer: Customer) => {
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      gender: customer.gender || '',
      birthDate: customer.birthDate || '',
      note: customer.note || '',
      status: customer.status || 'active',
      totalSpend: customer.totalSpend,
      orderCount: customer.orderCount,
      tier: customer.tier,
      referredById: (customer as any).referredById || ''
    });
    const refId = (customer as any).referredById;
    if (refId) {
       const refCust = rawCustomers.find(c => c.id === refId);
       setReferrerSearchTerm(refCust ? `${refCust.name} - ${refCust.phone}` : '');
    } else {
       setReferrerSearchTerm('');
    }
    setEditingId(customer.id!);
    setIsModalOpen(true);
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'diamond': return 'bg-cyan-100 text-cyan-600 border-cyan-200';
      case 'gold': return 'bg-amber-100 text-amber-600 border-amber-200';
      case 'silver': return 'bg-slate-100 text-slate-600 border-slate-200';
      default: return 'bg-orange-100 text-orange-600 border-orange-200';
    }
  };

  const getFilteredOrders = (cId?: string, isCard?: boolean) => {
     if (!cId) return [];
     return allOrders.filter(o => {
         if (o.customerId !== cId) return false;
         if (o.status === 'cancelled') return false;
         if (dateRange.startDate && dateRange.endDate) {
             const od = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt || 0);
             return od >= dateRange.startDate && od <= dateRange.endDate;
         }
         return true;
     });
  };

  const filtered = useMemo(() => {
     let result = rawCustomers.filter(c => {
       const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             (c.phone && c.phone.includes(searchTerm));
       
       let matchesDate = true;
       if (dateRange.startDate && dateRange.endDate) {
          const cd = c.createdAt?.toDate ? c.createdAt.toDate() : (c.createdAt ? new Date(c.createdAt) : null);
          const isCreatedInRange = cd ? (cd >= dateRange.startDate && cd <= dateRange.endDate) : false;
          
          const hasOrderInRange = getFilteredOrders(c.id).length > 0;
          
          matchesDate = isCreatedInRange || hasOrderInRange;
       }
       
       return matchesSearch && matchesDate;
     });

     const unique = new Map<string, any>();
     result.forEach(c => {
         const key = (c.phone || '').trim() || c.id;
         if (!unique.has(key)) {
             unique.set(key, c);
         }
     });

     const items = Array.from(unique.values());
     
     // Sort by spending in the selected datarange
     items.sort((a, b) => {
         const spendA = getFilteredOrders(a.id, true).reduce((sum, o) => sum + (o.totalAmount || 0), 0);
         const spendB = getFilteredOrders(b.id, true).reduce((sum, o) => sum + (o.totalAmount || 0), 0);
         return spendB - spendA;
     });

     return items;
  }, [rawCustomers, searchTerm, dateRange, allOrders]);

  const headerStats = useMemo(() => {
     let totalCustomers = rawCustomers.length;
     let newCustomers = 0;
     let oldCustomersWithOrders = 0;
     let totalSpend = 0;
     let totalUnpaid = 0;
     let totalOrders = 0;

     if (dateRange.startDate && dateRange.endDate) {
         rawCustomers.forEach(c => {
             const cd = c.createdAt?.toDate ? c.createdAt.toDate() : (c.createdAt ? new Date(c.createdAt) : null);
             const isCreatedInRange = cd ? (cd >= dateRange.startDate && cd <= dateRange.endDate) : false;
             
             if (isCreatedInRange) {
                 newCustomers++;
             } else {
                 const hasOrderInRange = getFilteredOrders(c.id).length > 0;
                 if (hasOrderInRange) oldCustomersWithOrders++;
             }
         });

         allOrders.forEach(o => {
             if (o.status === 'cancelled') return;
             const od = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt || 0);
             if (od >= dateRange.startDate! && od <= dateRange.endDate!) {
                 totalOrders++;
                 if (o.status === 'paid') totalSpend += (o.totalAmount || 0);
                 else if (['unpaid', 'pending', 'debt'].includes(o.status || '')) totalUnpaid += (o.totalAmount || 0);
             }
         });

     } else {
         newCustomers = totalCustomers;
         allOrders.forEach(o => {
             if (o.status === 'cancelled') return;
             totalOrders++;
             if (o.status === 'paid') totalSpend += (o.totalAmount || 0);
             else if (['unpaid', 'pending', 'debt'].includes(o.status || '')) totalUnpaid += (o.totalAmount || 0);
         });
     }

     return { totalCustomers, newCustomers, oldCustomersWithOrders, totalSpend, totalUnpaid, totalOrders };
  }, [rawCustomers, allOrders, dateRange]);

  const handleDelete = (e: React.MouseEvent | any, customer: Customer) => {
    if (e && e.stopPropagation) {
       e.stopPropagation();
    }
    setDeleteConfirm({ isOpen: true, customer });
  };

  const handleBulkDelete = () => {
    setDeleteConfirm({ isOpen: true, customer: null, isBulk: true });
  };

  const executeDeleteCustomer = async () => {
    if (deleteConfirm.isBulk) {
      if (selectedIds.length === 0) return;
      try {
        let deleted = 0;
        for (const id of selectedIds) {
           const customer = customers.find(c => c.id === id);
           if (!customer) continue;
           await updateDoc(doc(db, 'customers', id), {
              deleted_at: serverTimestamp(),
              deletedAt: serverTimestamp(),
              updatedAt: serverTimestamp()
           });
           deleted++;
        }
        toast.success(`Đã xóa mềm ${deleted} khách hàng`);
        setSelectedIds([]);
      } catch (error) {
        toast.error('Lỗi khi xóa nhiều!');
        console.error(error);
      } finally {
        setDeleteConfirm({ isOpen: false, customer: null });
      }
      return;
    }

    const customer = deleteConfirm.customer;
    if (!customer) return;

    try {
        await updateDoc(doc(db, 'customers', customer.id!), {
            deleted_at: serverTimestamp(),
            deletedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        toast.success('Đã xóa khách hàng thành công');
    } catch (error) {
        toast.error('Lỗi khi xóa khách hàng!');
        console.error(error);
    } finally {
        setDeleteConfirm({ isOpen: false, customer: null });
    }
  };

  return (
    <div className="space-y-8 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="w-full sm:w-auto">
          <h1 className="text-[24px] sm:text-3xl font-black tracking-tighter text-slate-900 uppercase italic">Hệ thống khách hàng</h1>
          <p className="text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mt-1">Quản lý định danh, phân hạng và lịch sử mua sắm.</p>
        </div>
        <div className="flex flex-wrap md:flex-nowrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
           {selectedIds.length > 0 && canEdit && (
             <button
               onClick={handleBulkDelete}
               className="flex items-center justify-center gap-2 px-4 py-3 sm:px-6 sm:py-4 bg-rose-50 text-rose-600 rounded-2xl sm:rounded-3xl font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] hover:bg-rose-100 transition-all shadow-sm active:scale-95"
             >
               <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
               Xóa {selectedIds.length} <span className="hidden sm:inline">mục</span>
             </button>
           )}
           <DateFilter onFilterChange={setDateRange} />
           <button 
             onClick={() => {
               import('xlsx').then(XLSX => {
                 const data = filtered.map(c => ({
                   'Họ tên': c.name,
                   'SĐT': c.phone,
                   'Tổng đơn hàng': getFilteredOrders(c.id, true).length,
                   'Tổng chi tiêu': getFilteredOrders(c.id, true).filter(o => o.status === 'paid').reduce((sum, o) => sum + (o.totalAmount || 0), 0),
                   'Tổng chưa thanh toán': getFilteredOrders(c.id, true).filter(o => ['unpaid', 'pending', 'debt'].includes(o.status || '')).reduce((sum, o) => sum + (o.totalAmount || 0), 0),
                   'Người giới thiệu': c.referredById ? rawCustomers.find(rc => rc.id === c.referredById)?.name || 'Không rõ' : 'Không có',
                   'Số lần giới thiệu': rawCustomers.filter(rc => rc.referredById === c.id).length,
                   'Ngày tạo': c.createdAt?.toDate ? formatDate(c.createdAt.toDate()) : 'N/A',
                   'Trạng thái': c.status === 'active' ? 'Đang hoạt động' : 'Tạm khóa'
                 }));
                 const ws = XLSX.utils.json_to_sheet(data);
                 const wb = XLSX.utils.book_new();
                 XLSX.utils.book_append_sheet(wb, ws, "DanhSachKhachHang");
                 XLSX.writeFile(wb, "danh_sach_khach_hang.xlsx");
               });
             }}
             className="hidden md:flex items-center justify-center gap-2 px-6 py-4 bg-emerald-50 text-emerald-600 rounded-3xl font-black text-xs uppercase tracking-[0.2em] hover:bg-emerald-100 transition-all shadow-sm active:scale-95"
           >
             <Download className="w-5 h-5" />
             Xuất Excel
           </button>
           {canEdit && (
             <button 
               onClick={handleSyncCRM}
               disabled={syncing}
               className="hidden md:flex items-center justify-center gap-3 px-6 py-4 bg-sky-50 text-sky-600 rounded-3xl font-black text-xs uppercase tracking-[0.2em] hover:bg-sky-100 transition-all shadow-sm active:scale-95 disabled:opacity-50"
             >
               {syncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <History className="w-5 h-5" />}
               Đồng bộ CRM
             </button>
           )}
           {canEdit && (
             <button 
               onClick={() => { resetForm(); setIsModalOpen(true); }}
               className="flex flex-1 md:flex-none items-center justify-center gap-2 sm:gap-3 px-4 py-3 sm:px-8 sm:py-4 bg-slate-900 text-white rounded-2xl sm:rounded-3xl font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] hover:bg-black transition-all shadow-xl sm:shadow-2xl shadow-slate-900/20 active:scale-95 whitespace-nowrap"
             >
               <Plus className="w-4 h-4 sm:w-5 h-5" />
               Đăng ký khách mới
             </button>
           )}
        </div>
      </div>

      {/* Header Stats view */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-6 rounded-[20px] sm:rounded-[24px] border border-slate-100 shadow-sm flex flex-col justify-center">
           <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 sm:mb-2 flex items-center gap-1 sm:gap-2"><Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" /> Tổng Khách</p>
           <p className="text-xl sm:text-2xl font-black text-slate-900">{headerStats.totalCustomers}</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-[20px] sm:rounded-[24px] border border-slate-100 shadow-sm flex flex-col justify-center">
           <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 sm:mb-2 flex items-center gap-1 sm:gap-2"><Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" /> KH Mới</p>
           <p className="text-xl sm:text-2xl font-black text-slate-900">{headerStats.newCustomers}</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-[20px] sm:rounded-[24px] border border-slate-100 shadow-sm flex flex-col justify-center">
           <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 sm:mb-2 flex items-center gap-1 sm:gap-2"><History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-500" /> KH Cũ</p>
           <p className="text-xl sm:text-2xl font-black text-slate-900">{headerStats.oldCustomersWithOrders}</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-[20px] sm:rounded-[24px] border border-slate-100 shadow-sm flex flex-col justify-center">
           <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 sm:mb-2 flex items-center gap-1 sm:gap-2 truncate"><CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" /> Tổng chi tiêu</p>
           <p className="text-base sm:text-lg font-black text-emerald-600 truncate" title={formatCurrency(headerStats.totalSpend)}>{formatCurrency(headerStats.totalSpend)}</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-[20px] sm:rounded-[24px] border border-slate-100 shadow-sm flex flex-col justify-center">
           <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 sm:mb-2 flex items-center gap-1 sm:gap-2 truncate"><Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500" /> Chưa thanh toán</p>
           <p className="text-base sm:text-lg font-black text-rose-600 truncate" title={formatCurrency(headerStats.totalUnpaid)}>{formatCurrency(headerStats.totalUnpaid)}</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-[20px] sm:rounded-[24px] border border-slate-100 shadow-sm flex flex-col justify-center">
           <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 sm:mb-2 flex items-center gap-1 sm:gap-2 truncate"><ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" /> Tổng đơn</p>
           <p className="text-xl sm:text-2xl font-black text-slate-900">{headerStats.totalOrders}</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 bg-white p-3 sm:p-6 rounded-[24px] sm:rounded-[36px] border border-slate-100 shadow-sm items-center">
        <div className="relative flex-1 w-full">
          <Search className="w-5 h-5 sm:w-6 sm:h-6 absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-slate-300" />
          <input 
            type="text" 
            placeholder="Tìm theo tên khách hoặc SĐT..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 sm:pl-16 sm:pr-6 sm:py-4.5 bg-slate-50 border-none rounded-[16px] sm:rounded-[24px] outline-none font-bold text-sm focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300 transition-all"
          />
        </div>
        <div className="flex gap-3 sm:gap-4 items-center shrink-0 w-full lg:w-auto">
          <label className="flex items-center gap-2 sm:gap-3 px-2 cursor-pointer shrink-0">
             <input 
                type="checkbox"
                checked={filtered.length > 0 && selectedIds.length === filtered.length}
                onChange={(e) => {
                   if (e.target.checked) setSelectedIds(filtered.map(c => c.id!));
                   else setSelectedIds([]);
                }}
                className="w-4 h-4 sm:w-5 sm:h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
             />
             <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest hidden sm:inline">Chọn Tất Cả</span>
          </label>
          <div className="px-5 py-3 sm:px-6 sm:py-4 bg-blue-50 rounded-[16px] sm:rounded-[20px] flex items-center justify-center gap-2 sm:gap-3 w-full lg:w-auto">
             <Users className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
             <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">{filtered.length} THÀNH VIÊN</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-4 md:gap-8">
        {loading ? (
          <div className="col-span-full py-32 text-center"><Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-600 opacity-20" /></div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-32 text-center">
            <Users className="w-20 h-20 mx-auto text-slate-100 mb-6" />
            <p className="text-slate-300 font-black uppercase tracking-[0.3em] text-xs">Không có dữ liệu phù hợp</p>
          </div>
        ) : filtered.map((customer, i) => (
          <motion.div 
            key={customer.id} 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => setActionMenuCustomer(customer)}
            className="cursor-pointer bg-white p-5 md:p-8 rounded-[24px] md:rounded-[40px] border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all group flex flex-col relative overflow-hidden"
          >
            {/* Background Decoration */}
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-slate-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-2xl pointer-events-none" />

            <div className="absolute top-5 left-5 md:top-6 md:left-6 z-10 bg-white/80 p-0.5 rounded backdrop-blur-sm">
               <input
                 type="checkbox"
                 checked={selectedIds.includes(customer.id!)}
                 onClick={e => e.stopPropagation()}
                 onChange={(e) => {
                    if (e.target.checked) setSelectedIds(prev => [...prev, customer.id!]);
                    else setSelectedIds(prev => prev.filter(id => id !== customer.id!));
                 }}
                 className="w-4 h-4 md:w-5 md:h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shadow-sm md:shadow-none"
               />
            </div>

            <div className="flex items-start justify-between mb-4 md:mb-8 pl-8 relative z-10">
              <div className="relative">
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-slate-900 flex items-center justify-center text-white text-xl md:text-2xl font-black shadow-lg shadow-slate-900/20">
                  {customer.name[0].toUpperCase()}
                </div>
                <div className={cn(
                  "absolute -bottom-2 -right-2 w-6 h-6 md:w-8 md:h-8 rounded-lg md:rounded-xl border-2 md:border-4 border-white flex items-center justify-center shadow-sm",
                  getTierColor(customer.tier)
                )}>
                  <Award className="w-3 h-3 md:w-4 md:h-4" />
                </div>
              </div>
              <div className="flex gap-1 md:gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 mix-blend-multiply">
                {canEdit && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); openEdit(customer); }}
                    className="p-2 md:p-3 hover:bg-blue-50 rounded-lg md:rounded-2xl text-slate-400 md:text-slate-300 hover:text-blue-600 transition-all relative z-20"
                  >
                    <Edit2 className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                )}
                {canEdit && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(e, customer); }}
                    className="p-2 md:p-3 hover:bg-red-50 rounded-lg md:rounded-2xl text-slate-400 md:text-slate-300 hover:text-red-500 transition-all relative z-20"
                  >
                    <X className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                )}
                <button 
                  onClick={(e) => { e.stopPropagation(); setSelectedCustomer(customer); }}
                  className="p-2 md:p-3 hover:bg-slate-50 rounded-lg md:rounded-2xl text-slate-400 md:text-slate-300 hover:text-slate-900 transition-all relative z-20"
                >
                  <ExternalLink className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>
            </div>
            
            <h3 className="text-xl md:text-2xl font-black text-slate-900 mb-4 md:mb-8 tracking-tighter truncate italic uppercase relative z-10 pr-2">{customer.name}</h3>
            
            <div className="space-y-4 mb-4 relative z-10">
              <div className="flex items-center gap-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest bg-slate-50/50 p-3 rounded-2xl border border-slate-50">
                <Phone className="w-4 h-4 text-emerald-500" />
                {customer.phone}
              </div>
              <div className="flex items-center gap-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest bg-slate-50/50 p-3 rounded-2xl border border-slate-50">
                <Mail className="w-4 h-4 text-blue-500" />
                <span className="truncate">{customer.email || 'CHƯA CÓ EMAIL'}</span>
              </div>
              <div className="flex items-center gap-4 text-slate-500 font-bold uppercase text-[10px] tracking-widest bg-slate-50/50 p-3 rounded-2xl border border-slate-50">
                <Calendar className="w-4 h-4 text-slate-400" />
                {(() => {
                   const cOrders = allOrders.filter(o => o.customerId === customer.id && o.status !== 'cancelled');
                   if (cOrders.length === 0) return 'Chưa có đơn';
                   const lastDate = [...cOrders].sort((a,b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0))[0]?.createdAt;
                   if (!lastDate) return 'Chưa có đơn';
                   return `Gần nhất: ${formatDate(lastDate.toDate ? lastDate.toDate() : new Date(lastDate))}`;
                })()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:gap-4 mt-auto">
              <div className="p-2 sm:p-3 md:p-4 bg-slate-50 rounded-xl md:rounded-[24px] border border-slate-100 flex flex-col justify-center">
                <p className="text-[7px] sm:text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 md:mb-1.5 flex items-center gap-1 md:gap-1.5 truncate">
                  <ShoppingBag className="w-2.5 h-2.5 md:w-3 md:h-3" /> Tổng đơn
                </p>
                <p className="font-black text-slate-900 text-xs md:text-sm">
                   {getFilteredOrders(customer.id, true).length}
                </p>
              </div>
              <div className="p-2 sm:p-3 md:p-4 bg-emerald-50 rounded-xl md:rounded-[24px] border border-emerald-100 flex flex-col justify-center">
                <p className="text-[7px] sm:text-[8px] md:text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1 md:mb-1.5 flex items-center gap-1 md:gap-1.5 truncate">
                  <CheckCircle2 className="w-2.5 h-2.5 md:w-3 md:h-3" /> Đã T.Toán
                </p>
                <p className="font-black text-emerald-700 text-xs md:text-sm truncate" title={formatCurrency(getFilteredOrders(customer.id, true).filter(o => o.status === 'paid').reduce((sum, o) => sum + (o.totalAmount || 0), 0))}>
                   {formatCurrency(getFilteredOrders(customer.id, true).filter(o => o.status === 'paid').reduce((sum, o) => sum + (o.totalAmount || 0), 0))}
                </p>
              </div>
              <div className="p-2 sm:p-3 md:p-4 bg-amber-50 rounded-xl md:rounded-[24px] border border-amber-100 flex flex-col justify-center">
                <p className="text-[7px] sm:text-[8px] md:text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1 md:mb-1.5 flex items-center gap-1 md:gap-1.5 truncate">
                  <Clock className="w-2.5 h-2.5 md:w-3 md:h-3" /> Chưa T.Toán
                </p>
                <p className="font-black text-amber-700 text-xs md:text-sm truncate" title={formatCurrency(getFilteredOrders(customer.id, true).filter(o => ['unpaid', 'pending', 'debt'].includes(o.status || '')).reduce((sum, o) => sum + (o.totalAmount || 0), 0))}>
                   {formatCurrency(getFilteredOrders(customer.id, true).filter(o => ['unpaid', 'pending', 'debt'].includes(o.status || '')).reduce((sum, o) => sum + (o.totalAmount || 0), 0))}
                </p>
              </div>
              <div className="p-2 sm:p-3 md:p-4 bg-slate-900 rounded-xl md:rounded-[24px] border border-slate-800 flex flex-col justify-center">
                <p className="text-[7px] sm:text-[8px] md:text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1 md:mb-1.5 flex items-center gap-1 md:gap-1.5 truncate">
                  <TrendingUp className="w-2.5 h-2.5 md:w-3 md:h-3" /> Đã tiêu
                </p>
                <p className="font-black text-white text-xs md:text-sm truncate" title={formatCurrency(getFilteredOrders(customer.id, true).filter(o => o.status === 'paid').reduce((sum, o) => sum + (o.totalAmount || 0), 0))}>
                   {formatCurrency(getFilteredOrders(customer.id, true).filter(o => o.status === 'paid').reduce((sum, o) => sum + (o.totalAmount || 0), 0))}
                </p>
              </div>
            </div>

            <button 
              onClick={(e) => { e.stopPropagation(); setSelectedCustomer(customer); }}
              className="mt-4 md:mt-8 relative z-20 w-full py-3 md:py-4 bg-slate-50 text-slate-900 rounded-[20px] md:rounded-[24px] font-black text-[9px] md:text-[10px] uppercase tracking-[0.2em] hover:bg-slate-900 hover:text-white transition-all shadow-sm flex items-center justify-center gap-2 md:gap-3 group/btn"
            >
              Lịch sử mua hàng
              <ChevronRight className="w-3 h-3 md:w-4 md:h-4 group-hover/btn:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        ))}
      </div>

      {/* Action Menu Modal */}
      <AnimatePresence>
        {actionMenuCustomer && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setActionMenuCustomer(null)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
             <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-sm bg-white rounded-[40px] shadow-2xl p-8 overflow-hidden text-center">
                 <div className="w-20 h-20 bg-slate-900 text-white rounded-3xl mx-auto flex items-center justify-center text-3xl font-black italic shadow-lg shadow-slate-900/20 mb-6">
                    {actionMenuCustomer.name[0].toUpperCase()}
                 </div>
                 <h3 className="text-2xl font-black text-slate-900 mb-2 truncate uppercase italic">{actionMenuCustomer.name}</h3>
                 <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-8">{actionMenuCustomer.phone}</p>
                 
                 <div className="space-y-3">
                    <button 
                       onClick={() => {
                          const id = actionMenuCustomer.id;
                          setActionMenuCustomer(null);
                          navigate('/orders', { state: { autoCreateOrderForCustomer: id } });
                       }}
                       className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
                    >
                       Tạo đơn hàng
                    </button>
                    {canEdit && (
                        <button 
                           onClick={() => {
                              const c = actionMenuCustomer;
                              setActionMenuCustomer(null);
                              openEdit(c);
                           }}
                           className="w-full py-4 bg-slate-50 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-100 transition-colors"
                        >
                           Chỉnh sửa hồ sơ
                        </button>
                    )}
                    {canEdit && (
                        <button 
                           onClick={() => {
                              const c = actionMenuCustomer;
                              setActionMenuCustomer(null);
                              handleDelete({} as any, c);
                           }}
                           className="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-rose-100 transition-colors"
                        >
                           Xóa khách hàng
                        </button>
                    )}
                    <button 
                       onClick={() => setActionMenuCustomer(null)}
                       className="w-full py-4 text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] hover:text-slate-900 transition-colors mt-2"
                    >
                       Đóng
                    </button>
                 </div>
             </motion.div>
           </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-2xl bg-white rounded-[32px] sm:rounded-[44px] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.3)] overflow-hidden max-h-[90vh] sm:max-h-none flex flex-col">
              <div className="px-6 py-4 sm:px-10 sm:py-8 border-b border-slate-50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 sm:gap-5">
                  <div className="w-10 h-10 sm:w-14 sm:h-14 bg-slate-900 rounded-xl sm:rounded-[20px] flex items-center justify-center text-white">
                    <Users className="w-5 h-5 sm:w-7 sm:h-7" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tighter italic">{editingId ? 'Cập nhật hồ sơ' : 'Đăng ký thành viên'}</h2>
                    <p className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] sm:tracking-[0.3em] mt-0.5 sm:mt-1">Thông tin định danh duy nhất</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 sm:p-3 hover:bg-slate-50 rounded-xl sm:rounded-2xl transition-colors">
                  <X className="w-5 h-5 sm:w-7 sm:h-7 text-slate-400" />
                </button>
              </div>

              <div className="overflow-y-auto custom-scrollbar flex-1">
                <form onSubmit={handleSubmit} className="p-6 sm:p-12 space-y-6 sm:space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-1 sm:space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Họ và tên</label>
                      <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-3 sm:px-6 sm:py-4 bg-slate-50 border-none rounded-xl sm:rounded-[20px] font-bold text-sm focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-200" placeholder="NGUYEN VAN A" />
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Số điện thoại</label>
                      <input required type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full px-4 py-3 sm:px-6 sm:py-4 bg-slate-50 border-none rounded-xl sm:rounded-[20px] font-bold text-sm focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-200" placeholder="0XXXXXXXXX" />
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Email</label>
                      <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full px-4 py-3 sm:px-6 sm:py-4 bg-slate-50 border-none rounded-xl sm:rounded-[20px] font-bold text-sm focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-200" placeholder="example@mail.com" />
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Phân hạng (Tier)</label>
                      <select value={formData.tier} onChange={e => setFormData({ ...formData, tier: e.target.value as any })} className="w-full px-4 py-3 sm:px-6 sm:py-4 bg-slate-50 border-none rounded-xl sm:rounded-[20px] font-bold text-sm focus:ring-2 focus:ring-blue-500/10 appearance-none">
                        <option value="bronze">BRONZE MEMBER</option>
                        <option value="silver">SILVER MEMBER</option>
                        <option value="gold">GOLD MEMBER</option>
                        <option value="diamond">DIAMOND VIP</option>
                      </select>
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Giới tính</label>
                      <select value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })} className="w-full px-4 py-3 sm:px-6 sm:py-4 bg-slate-50 border-none rounded-xl sm:rounded-[20px] font-bold text-sm focus:ring-2 focus:ring-blue-500/10 appearance-none">
                        <option value="">CHỌN GIỚI TÍNH</option>
                        <option value="male">NAM</option>
                        <option value="female">NỮ</option>
                      </select>
                    </div>
                    <div className="space-y-1 sm:space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Ngày sinh</label>
                      <input type="date" value={formData.birthDate} onChange={e => setFormData({ ...formData, birthDate: e.target.value })} className="w-full px-4 py-3 sm:px-6 sm:py-4 bg-slate-50 border-none rounded-xl sm:rounded-[20px] font-bold text-sm focus:ring-2 focus:ring-blue-500/10 text-slate-900" />
                    </div>
                    <div className="space-y-1 sm:space-y-2 relative" ref={referrerDropdownRef}>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Người giới thiệu</label>
                      <div className="relative">
                         <input 
                            type="text" 
                            placeholder="Tìm kiếm người giới thiệu..." 
                            value={referrerSearchTerm}
                            onChange={(e) => {
                               setReferrerSearchTerm(e.target.value);
                               setIsReferrerDropdownOpen(true);
                               if (e.target.value === '') setFormData({ ...formData, referredById: '' });
                            }}
                            onClick={() => setIsReferrerDropdownOpen(true)}
                            className="w-full px-4 py-3 sm:px-6 sm:py-4 bg-indigo-50/50 border border-indigo-100/50 rounded-xl sm:rounded-[20px] font-bold text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all placeholder:text-indigo-300"
                         />
                         <Search className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-indigo-300" />
                      </div>

                      {isReferrerDropdownOpen && (
                         <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl shadow-slate-900/10 border border-slate-100 overflow-hidden z-50 max-h-64 overflow-y-auto">
                            {filteredReferrers.length === 0 ? (
                               <div className="p-4 text-center text-xs font-bold text-slate-400">Không tìm thấy khách hàng.</div>
                            ) : (
                               <ul className="py-2">
                                  {filteredReferrers.map(c => (
                                     <li 
                                       key={c.id} 
                                       onClick={() => {
                                          setFormData({ ...formData, referredById: c.id });
                                          setReferrerSearchTerm(`${c.name} - ${c.phone}`);
                                          setIsReferrerDropdownOpen(false);
                                       }}
                                       className="px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-50 last:border-0 flex items-center gap-3"
                                     >
                                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black uppercase shrink-0">
                                           {c.name?.charAt(0) || 'K'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                           <div className="flex items-center justify-between gap-2">
                                              <span className="font-bold text-slate-900 truncate">{c.name}</span>
                                              <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full shrink-0">{c.phone}</span>
                                           </div>
                                        </div>
                                     </li>
                                  ))}
                               </ul>
                            )}
                         </div>
                      )}
                    </div>
                    <div className="col-span-full space-y-1 sm:space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Địa chỉ thường trú</label>
                      <textarea rows={2} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full px-4 py-3 sm:px-6 sm:py-4 bg-slate-50 border-none rounded-xl sm:rounded-[20px] font-bold text-sm focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-200" placeholder="Số nhà, đường, phường/xã..." />
                    </div>
                    <div className="col-span-full space-y-1 sm:space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Ghi chú</label>
                      <textarea rows={2} value={formData.note} onChange={e => setFormData({ ...formData, note: e.target.value })} className="w-full px-4 py-3 sm:px-6 sm:py-4 bg-slate-50 border-none rounded-xl sm:rounded-[20px] font-bold text-sm focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-200" placeholder="Thông tin thêm..." />
                    </div>
                    
                    {!editingId && (
                       <div className="col-span-full mt-2 sm:mt-4">
                         <label className="flex items-center gap-3 cursor-pointer group">
                            <div className={cn("w-5 h-5 sm:w-6 sm:h-6 rounded border-2 flex items-center justify-center transition-all", createOrderNow ? "bg-blue-600 border-blue-600" : "bg-white border-slate-300 group-hover:border-blue-500")}>
                               {createOrderNow && <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />}
                            </div>
                            <input type="checkbox" className="hidden" checked={createOrderNow} onChange={(e) => setCreateOrderNow(e.target.checked)} />
                            <span className="font-bold text-xs sm:text-sm text-slate-900 leading-none">Tạo đơn hàng ngay</span>
                         </label>
                       </div>
                    )}
                  </div>

                  <div className="flex gap-3 sm:gap-4 pt-4">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 sm:py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors">Hủy thao tác</button>
                    <button type="submit" disabled={loading} className="flex-[2] py-4 sm:py-5 bg-slate-900 text-white rounded-2xl sm:rounded-[24px] font-black text-[10px] uppercase tracking-[0.2em] sm:tracking-[0.3em] shadow-2xl shadow-slate-900/30 active:scale-95 transition-all flex items-center justify-center gap-2 sm:gap-3">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {editingId ? 'Cập nhật hệ thống' : 'Ghi danh hội viên'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Details Drawer */}
      <AnimatePresence>
        {selectedCustomer && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedCustomer(null)} className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col">
              <div className="p-4 sm:p-8 border-b border-slate-50 flex flex-wrap sm:flex-nowrap items-center justify-between shrink-0 gap-4">
                <div className="flex items-center gap-3 sm:gap-5 w-full sm:w-auto">
                   <div className="w-10 h-10 sm:w-14 sm:h-14 bg-slate-900 rounded-xl sm:rounded-[20px] flex shrink-0 items-center justify-center text-white">
                    <History className="w-5 h-5 sm:w-7 sm:h-7" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-2xl font-black text-slate-900 uppercase tracking-tighter italic truncate">Lịch sử hội viên</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] sm:tracking-[0.3em] mt-0.5 sm:mt-1 truncate">{selectedCustomer.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">
                  <button 
                     onClick={() => {
                        navigate('/orders', { state: { autoCreateOrderForCustomer: selectedCustomer.id } });
                     }}
                     className="px-3 py-2 sm:px-4 sm:py-2.5 bg-blue-600 text-white rounded-lg sm:rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                     Tạo đơn hàng
                  </button>
                  <button onClick={() => setSelectedCustomer(null)} className="p-2 sm:p-3 hover:bg-slate-50 rounded-lg sm:rounded-2xl transition-colors">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 sm:space-y-10 custom-scrollbar">
                {/* Stats Summary */}
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <div onClick={() => setCustomerHistoryFilter('paid')} className={cn("p-3 sm:p-6 rounded-xl sm:rounded-[32px] cursor-pointer transition-all border flex flex-col justify-center items-center text-center", customerHistoryFilter === 'paid' ? "bg-emerald-500 text-white border-transparent shadow-lg shadow-emerald-500/20" : "bg-white text-slate-900 border-slate-100 hover:bg-slate-50")}>
                    <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest sm:tracking-[0.2em] opacity-80 mb-1 sm:mb-2 truncate w-full">Đã T.Toán</p>
                    <p className="text-sm sm:text-lg font-black italic truncate w-full" title={formatCurrency(customerOrders.filter(o => !o.deletedAt && o.status === 'paid').reduce((sum, o) => sum + (o.totalAmount || 0), 0))}>
                       {formatCurrency(customerOrders.filter(o => !o.deletedAt && o.status === 'paid').reduce((sum, o) => sum + (o.totalAmount || 0), 0))}
                    </p>
                  </div>
                  <div onClick={() => setCustomerHistoryFilter('unpaid')} className={cn("p-3 sm:p-6 rounded-xl sm:rounded-[32px] cursor-pointer transition-all border flex flex-col justify-center items-center text-center", customerHistoryFilter === 'unpaid' ? "bg-rose-500 text-white border-transparent shadow-lg shadow-rose-500/20" : "bg-white text-slate-900 border-slate-100 hover:bg-slate-50")}>
                    <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest sm:tracking-[0.2em] opacity-80 mb-1 sm:mb-2 truncate w-full">Chưa T.Toán</p>
                    <p className="text-sm sm:text-lg font-black italic truncate w-full" title={formatCurrency(customerOrders.filter(o => !o.deletedAt && ['unpaid', 'pending', 'debt'].includes(o.status || '')).reduce((sum, o) => sum + (o.totalAmount || 0), 0))}>
                       {formatCurrency(customerOrders.filter(o => !o.deletedAt && ['unpaid', 'pending', 'debt'].includes(o.status || '')).reduce((sum, o) => sum + (o.totalAmount || 0), 0))}
                    </p>
                  </div>
                  <div onClick={() => setCustomerHistoryFilter('all')} className={cn("p-3 sm:p-6 rounded-xl sm:rounded-[32px] cursor-pointer transition-all border flex flex-col justify-center items-center text-center", customerHistoryFilter === 'all' ? "bg-blue-600 text-white border-transparent shadow-lg shadow-blue-500/20" : "bg-white text-slate-900 border-slate-100 hover:bg-slate-50")}>
                    <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest sm:tracking-[0.2em] opacity-80 mb-1 sm:mb-2 truncate w-full">Tổng đơn</p>
                    <p className="text-sm sm:text-lg font-black italic truncate w-full">{customerOrders.filter(o => !o.deletedAt && o.status !== 'cancelled').length} <span className="text-[8px] sm:text-xs not-italic font-bold opacity-50 text-current">LẦN</span></p>
                  </div>
                </div>

                {/* History List */}
                <div className="space-y-6">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] px-2 flex items-center justify-between">
                    Nhật ký giao dịch
                  </h3>
                  
                  {loadingOrders ? (
                    <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-200" /></div>
                  ) : customerOrders.length === 0 ? (
                    <div className="py-20 text-center bg-slate-50 rounded-[40px] border border-dashed border-slate-200 text-slate-300 font-bold uppercase tracking-widest text-[9px]">Chưa có lịch sử giao dịch</div>
                  ) : (
                    <div className="space-y-4">
                      {customerOrders.filter(o => {
                         if (customerHistoryFilter === 'paid') return o.status === 'paid';
                         if (customerHistoryFilter === 'unpaid') return ['unpaid', 'pending', 'debt'].includes(o.status || '');
                         return o.status !== 'cancelled';
                      }).map(order => (
                         <div key={order.id} onClick={() => setViewingOrder(order)} className={cn("p-4 sm:p-6 bg-white border border-slate-100 rounded-[24px] sm:rounded-[32px] transition-all flex flex-col gap-4 cursor-pointer", order.deletedAt ? "opacity-50 grayscale" : "hover:shadow-xl group")}>
                           <div className="flex items-start sm:items-center justify-between gap-2">
                             <div className="flex items-center gap-2 sm:gap-4 shrink-0 max-w-[60%]">
                               <div className="w-8 h-8 sm:w-12 sm:h-12 bg-slate-50 rounded-lg sm:rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 transition-colors shrink-0">
                                 <ShoppingBag className="w-4 h-4 sm:w-6 sm:h-6" />
                               </div>
                               <div className="min-w-0">
                                 <p className="font-black text-slate-900 text-[10px] sm:text-xs uppercase flex flex-wrap items-center gap-1 sm:gap-2 truncate">
                                     #TX-{order.id?.slice(-6).toUpperCase()}
                                     {order.paymentMethod && (
                                       <span className="bg-slate-100 text-slate-500 px-1 sm:px-1.5 py-0.5 rounded text-[8px] whitespace-nowrap">
                                          {order.paymentMethod === 'cash' ? 'Tiền mặt' : 'CK'}
                                       </span>
                                     )}
                                 </p>
                                 <p className="text-[8px] sm:text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 sm:mt-1 flex items-center gap-1 truncate">{order.createdAt ? formatDate(order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt)) : '...'}</p>
                                 {order.creatorName && (
                                     <p className="text-[8px] text-slate-400 font-medium mt-0.5 sm:mt-1 uppercase truncate">NV: {order.creatorName}</p>
                                 )}
                               </div>
                             </div>
                             <div className="text-right shrink-0">
                               <p className="font-black text-slate-900 text-xs sm:text-sm whitespace-nowrap">{formatCurrency(order.totalAmount)}</p>
                               <div className={cn(
                                 "text-[8px] font-black uppercase tracking-widest sm:tracking-[0.2em] mt-1 px-1.5 sm:px-2 py-0.5 rounded-full inline-block text-center",
                                 order.deletedAt ? "bg-rose-100 text-rose-600" :
                                 order.status === 'paid' ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                               )}>
                                 {order.deletedAt ? "Đã xóa" : (order.status === 'paid' ? 'Đã T.Toán' : 'Chưa T.Toán')}
                               </div>
                             </div>
                           </div>
                           {(order.items && order.items.length > 0) && (
                               <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                  <table className="w-full text-xs">
                                     <tbody>
                                         {order.items.map((item, idx) => (
                                              <tr key={idx}>
                                                 <td className="py-1 text-slate-600 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                                                    <span className={cn(
                                                       "text-[8px] px-1 py-0.5 rounded mr-2 uppercase inline-block",
                                                       item.type === 'product' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                                                    )}>
                                                        {item.type === 'product' ? 'SP' : 'DV'}
                                                    </span>
                                                    {item.name}
                                                 </td>
                                                 <td className="py-1 text-slate-500 font-bold px-2 whitespace-nowrap">x{item.quantity}</td>
                                                 <td className="py-1 text-slate-900 font-black text-right whitespace-nowrap">{formatCurrency(item.price * item.quantity)}</td>
                                              </tr>
                                         ))}
                                     </tbody>
                                  </table>
                               </div>
                           )}
                           
                           {order.note && (
                               <div className="bg-amber-50 text-amber-700 text-xs p-3 rounded-xl border border-amber-100">
                                  <span className="font-bold uppercase tracking-widest text-[9px] block mb-1">Ghi chú</span>
                                  {order.note}
                               </div>
                           )}
                           
                           {order.deletedAt && (
                               <div className="bg-rose-50/50 p-3 rounded-2xl border border-rose-100/50 flex flex-col gap-1 mt-2">
                                   <div className="text-[10px] font-bold text-rose-600">
                                       <span className="opacity-70">Xóa lúc:</span> {formatDate(order.deletedAt.toDate ? order.deletedAt.toDate() : new Date(order.deletedAt))}
                                   </div>
                                   <div className="text-[10px] font-bold text-rose-600">
                                       <span className="opacity-70">Bởi:</span> {order.deletedBy || '—'}
                                   </div>
                               </div>
                           )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Viewing Order Details Drawer */}
      <AnimatePresence>
        {viewingOrder && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewingOrder(null)} className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[60]" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-2xl z-[70] flex flex-col">
              <div className="p-8 border-b border-slate-50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-900 rounded-[16px] flex items-center justify-center text-white">
                    <ClipboardList className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter italic">Chi tiết hóa đơn</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em] mt-1">#TX-{viewingOrder.id?.slice(-6).toUpperCase()}</p>
                  </div>
                </div>
                <button onClick={() => setViewingOrder(null)} className="p-3 hover:bg-slate-50 rounded-2xl transition-colors">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {/* Status Indicator */}
                <div className="flex gap-2">
                   <div className={cn("flex-1 p-4 rounded-2xl border flex items-center justify-center font-black uppercase text-[10px] tracking-widest", viewingOrder.status === 'paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100')}>
                      {viewingOrder.status === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán'}
                   </div>
                   {viewingOrder.status === 'paid' && (
                     <div className="flex-1 p-4 bg-blue-50 text-blue-600 border border-blue-100 rounded-2xl flex items-center justify-center font-black uppercase text-[10px] tracking-widest">
                       {viewingOrder.paymentMethod === 'cash' ? 'Tiền mặt' : viewingOrder.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Thanh toán'}
                     </div>
                   )}
                </div>

                {/* Items */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Danh sách sản phẩm/dịch vụ</h3>
                  <div className="space-y-3">
                    {viewingOrder.items.map((item, idx) => (
                      <div key={idx} className="p-4 bg-slate-50 border border-slate-100 rounded-3xl flex items-center gap-4">
                        <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-slate-300 shadow-sm">
                          {item.type === 'service' ? <Sparkles className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                        </div>
                        <div className="flex-1">
                          <p className="font-black text-xs text-slate-900 uppercase tracking-tight">{item.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                             <span className={cn("text-[7px] font-black px-1 py-0.5 rounded", item.type === 'product' ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600")}>
                               {item.type === 'product' ? 'PRODUCT' : 'SERVICE'}
                             </span>
                             <p className="text-[10px] text-slate-400 font-bold uppercase">{formatCurrency(item.price)} × {item.quantity}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-sm text-slate-900">{formatCurrency(item.price * item.quantity)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {viewingOrder.note && (
                  <div className="space-y-3">
                     <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Ghi chú</h3>
                     <div className="p-4 bg-amber-50 text-amber-700 rounded-2xl border border-amber-100 text-xs shadow-inner">
                       {viewingOrder.note}
                     </div>
                  </div>
                )}

                {/* Financial Summary */}
                <div className="p-8 bg-slate-900 rounded-[32px] text-white space-y-4 shadow-xl">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-slate-500 font-bold uppercase tracking-widest text-[9px]">
                      <span>Tiền hàng</span>
                      <span className="text-slate-300">{formatCurrency(viewingOrder.totalAmount + (viewingOrder.discount || 0) - (viewingOrder.shippingFee || 0))}</span>
                    </div>
                    {viewingOrder.discount > 0 && (
                       <div className="flex items-center justify-between text-rose-400 font-bold uppercase tracking-widest text-[9px]">
                         <span>Giảm giá</span>
                         <span>- {formatCurrency(viewingOrder.discount)}</span>
                       </div>
                    )}
                    {viewingOrder.shippingFee > 0 && (
                       <div className="flex items-center justify-between text-blue-400 font-bold uppercase tracking-widest text-[9px]">
                         <span>Phí vận tải</span>
                         <span>+ {formatCurrency(viewingOrder.shippingFee)}</span>
                       </div>
                    )}
                  </div>
                  <div className="h-px bg-white/10 my-4"></div>
                  <div className="flex items-center justify-between gap-4">
                     <div>
                       <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Tổng thanh toán</p>
                       <h4 className="text-3xl font-black tracking-tighter mt-1 italic">{formatCurrency(viewingOrder.totalAmount)}</h4>
                     </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="Xác nhận xóa khách hàng"
        message={deleteConfirm.customer?.orderCount ? 'Khách hàng này đã có giao dịch mua sắm. Khách hàng sẽ được ẩn đi thay vì xóa hoàn toàn.' : 'Bạn có chắc chắn muốn xóa dữ liệu khách hàng này? Thao tác không thể hoàn tác.'}
        onConfirm={executeDeleteCustomer}
        onCancel={() => setDeleteConfirm({ isOpen: false, customer: null })}
      />
    </div>
  );
}
