import React, { useState } from 'react';
import { useReferralData, ReferrerData } from '../../lib/useReferralData';
import { Users, Search, Award, TrendingUp, DollarSign, Loader2, ChevronRight, Download } from 'lucide-react';
import { formatCurrency, formatDate } from '../../lib/utils';
import { DateRange, DateFilter } from '../../components/DateFilter';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

export function Referrers() {
  const { referrersMap, loading, allCustomers } = useReferralData();
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ startDate: null, endDate: null });
  const [selectedReferrer, setSelectedReferrer] = useState<any>(null);

  const referrersList = (Array.from(referrersMap.values()) as ReferrerData[]).filter((r: ReferrerData) => {
    let matchesSearch = r.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                       (r.customer.phone && r.customer.phone.includes(searchTerm));
    
    // Optional date filter: could apply to when they joined or just overall, for simplicity we apply it to when they joined
    let matchesDate = true;
    if (dateRange.startDate && dateRange.endDate) {
      const joinDate = r.customer.createdAt?.toDate ? r.customer.createdAt.toDate() : new Date(r.customer.createdAt || 0);
      matchesDate = joinDate >= dateRange.startDate && joinDate <= dateRange.endDate;
    }

    return matchesSearch && matchesDate;
  }).sort((a: ReferrerData, b: ReferrerData) => b.totalReferralRevenue - a.totalReferralRevenue);

  const totalReferralRev = referrersList.reduce((sum, r: ReferrerData) => sum + r.totalReferralRevenue, 0);
  const totalCommission = referrersList.reduce((sum, r: ReferrerData) => sum + r.totalCommission, 0);

  const exportExcel = () => {
    const data = referrersList.map((r: ReferrerData) => ({
      'Họ tên': r.customer.name,
      'SĐT': r.customer.phone,
      'Số khách giới thiệu': r.referredCustomers.length,
      'Tổng doanh số': r.totalReferralRevenue,
      'Tổng đơn hàng': r.totalReferralOrders,
      'Hoa hồng nhận được': r.totalCommission,
      'Hạng': r.customer.tier
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KhachHangGioiThieu");
    XLSX.writeFile(wb, "khach_hang_gioi_thieu.xlsx");
  };

  if (loading) return <div className="flex-1 flex justify-center items-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

  return (
    <div className="space-y-8 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tighter text-slate-900 uppercase italic">Khách hàng giới thiệu</h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em] mt-1">Quản lý đối tác và hoa hồng Referral</p>
        </div>
        <div className="flex items-center gap-4">
          <DateFilter onFilterChange={setDateRange} />
          <button onClick={exportExcel} className="flex items-center gap-2 px-6 py-4 bg-emerald-50 text-emerald-600 rounded-3xl font-black text-xs uppercase tracking-[0.2em] hover:bg-emerald-100 transition-all shadow-sm">
            <Download className="w-5 h-5" />
            Xuất Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex flex-col justify-center">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Users className="w-4 h-4 text-purple-500" /> Tổng người giới thiệu</p>
           <p className="text-2xl font-black text-slate-900">{referrersList.length}</p>
        </div>
        <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex flex-col justify-center">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" /> Tổng doanh số Referral</p>
           <p className="text-2xl font-black text-emerald-600">{formatCurrency(totalReferralRev)}</p>
        </div>
        <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex flex-col justify-center">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><DollarSign className="w-4 h-4 text-amber-500" /> Tổng hoa hồng ước tính</p>
           <p className="text-2xl font-black text-amber-600">{formatCurrency(totalCommission)}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[36px] border border-slate-100 shadow-sm">
        <div className="relative mb-6">
          <Search className="w-6 h-6 absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
          <input 
            type="text" 
            placeholder="Tìm theo tên hoặc SĐT..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-16 pr-6 py-4.5 bg-slate-50 border-none rounded-[24px] outline-none font-bold focus:ring-2 focus:ring-indigo-500/10 placeholder:text-slate-300"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] uppercase tracking-widest font-black text-slate-400">
                <th className="p-4">Khách hàng</th>
                <th className="p-4 text-center">Đã giới thiệu</th>
                <th className="p-4 text-right">Tổng đơn Referral</th>
                <th className="p-4 text-right">Doanh số Referral</th>
                <th className="p-4 text-right transform">Hoa hồng ước tính</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {referrersList.map(item => (
                <tr key={item.customer.id} className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors" onClick={() => setSelectedReferrer(item)}>
                  <td className="p-4">
                     <div className="flex items-center gap-4">
                       <div className="w-10 h-10 bg-slate-900 rounded-xl text-white font-black flex items-center justify-center italic text-xl">
                         {item.customer.name[0].toUpperCase()}
                       </div>
                       <div>
                         <p className="font-black text-slate-900 uppercase italic text-sm">{item.customer.name}</p>
                         <p className="font-bold text-[10px] text-slate-400">{item.customer.phone}</p>
                       </div>
                     </div>
                  </td>
                  <td className="p-4 text-center font-black text-purple-600">{item.referredCustomers.length}</td>
                  <td className="p-4 text-right font-black text-slate-600">{item.totalReferralOrders}</td>
                  <td className="p-4 text-right font-black text-emerald-600">{formatCurrency(item.totalReferralRevenue)}</td>
                  <td className="p-4 text-right font-black text-amber-600">{formatCurrency(item.totalCommission)}</td>
                  <td className="p-4 text-right">
                     <ChevronRight className="w-5 h-5 text-slate-300 ml-auto" />
                  </td>
                </tr>
              ))}
              {referrersList.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">Không có dữ liệu</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selectedReferrer && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedReferrer(null)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
              <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-4xl bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                 <div className="p-8 border-b border-slate-100 shrink-0 bg-slate-900 flex justify-between items-start">
                    <div className="flex items-center gap-6">
                       <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center font-black text-3xl text-white italic">
                          {selectedReferrer.customer.name[0].toUpperCase()}
                       </div>
                       <div>
                          <h2 className="text-3xl font-black text-white italic uppercase tracking-tight">{selectedReferrer.customer.name}</h2>
                          <div className="flex gap-4 mt-2">
                             <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedReferrer.customer.phone}</span>
                             <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Hoa hồng: {formatCurrency(selectedReferrer.totalCommission)}</span>
                          </div>
                       </div>
                    </div>
                    <button onClick={() => setSelectedReferrer(null)} className="text-white/50 hover:text-white font-black text-xs uppercase tracking-widest">Đóng</button>
                 </div>
                 
                 <div className="p-8 flex-1 overflow-y-auto">
                    <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs mb-6 flex items-center gap-2">
                       <Users className="w-5 h-5 text-indigo-500" /> Danh sách khách hàng đã giới thiệu ({selectedReferrer.referredCustomers.length})
                    </h3>
                    <table className="w-full text-left border-collapse">
                       <thead>
                         <tr className="border-b border-slate-100 text-[10px] uppercase tracking-widest font-black text-slate-400">
                           <th className="p-3">Khách hàng</th>
                           <th className="p-3">Ngày tạo</th>
                           <th className="p-3 text-right">Doanh số (Đã TT)</th>
                         </tr>
                       </thead>
                       <tbody>
                         {selectedReferrer.referredCustomers.map((c: any) => {
                            const cDate = c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt || 0);
                            const customerOrders = allCustomers.length > 0 ? [] : []; // We shouldn't use useReferralData inside
                            return (
                               <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                 <td className="p-3">
                                    <p className="font-bold text-slate-900 text-sm">{c.name}</p>
                                    <p className="text-[10px] text-slate-400 font-bold">{c.phone}</p>
                                 </td>
                                 <td className="p-3 text-xs text-slate-600 font-bold">{formatDate(cDate)}</td>
                                 <td className="p-3 text-right font-black text-emerald-600">
                                   Chi tiết ở module báo cáo
                                 </td>
                               </tr>
                            )
                         })}
                       </tbody>
                    </table>
                 </div>
              </motion.div>
           </div>
        )}
      </AnimatePresence>
    </div>
  );
}
