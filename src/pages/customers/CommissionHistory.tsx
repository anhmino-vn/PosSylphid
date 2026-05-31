import React, { useState } from 'react';
import { useReferralData } from '../../lib/useReferralData';
import { Award, Search, Loader2 } from 'lucide-react';
import { formatCurrency, formatDate } from '../../lib/utils';
import { DateRange, DateFilter } from '../../components/DateFilter';

export function CommissionHistory() {
  const { allCustomers, allOrders, customerMap, settings, getCommissionPercent, loading } = useReferralData();
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ startDate: null, endDate: null });

  // Generate commission history based on paid orders of referred customers
  const commissionLogs: any[] = [];
  
  if (settings.commissionMethod === 'PER_ORDER') {
    allOrders.forEach(order => {
       if (order.status !== 'paid' || !order.customerId) return;
       const customer = customerMap.get(order.customerId);
       if (customer && customer.referredById) {
          const referrer = customerMap.get(customer.referredById);
          if (referrer) {
             const ordDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt || 0);
             
             let matchDate = true;
             if (dateRange.startDate && dateRange.endDate) {
               matchDate = ordDate >= dateRange.startDate && ordDate <= dateRange.endDate;
             }
             
             let matchSearch = referrer.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                               customer.name.toLowerCase().includes(searchTerm.toLowerCase());
                               
             if (matchDate && matchSearch) {
                const amount = order.totalAmount || 0;
                const percent = getCommissionPercent(amount);
                commissionLogs.push({
                   id: order.id,
                   date: ordDate,
                   referrerName: referrer.name,
                   customerName: customer.name,
                   orderId: order.id,
                   revenue: amount,
                   percent: percent,
                   commission: amount * (percent / 100),
                   status: 'Đã duyệt' // Defaulted simulated status
                });
             }
          }
       }
    });
  } else {
    // TOTAL_REVENUE isn't per order. We will generate aggregated logs per user.
    allCustomers.forEach(c => {
       if (c.referredById) {
          const referrer = customerMap.get(c.referredById);
          if (referrer) {
             // For TOTAL_REVENUE, we just show one aggregate line for now to keep things simple
             const cOrders = allOrders.filter(o => o.customerId === c.id && o.status === 'paid');
             if (cOrders.length > 0) {
                 const tRev = cOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
                 const percent = getCommissionPercent(tRev);
                 
                 let matchSearch = referrer.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                   c.name.toLowerCase().includes(searchTerm.toLowerCase());
                                   
                 if (matchSearch) {
                     commissionLogs.push({
                       id: c.id,
                       date: new Date(),
                       referrerName: referrer.name,
                       customerName: c.name,
                       orderId: 'Tổng Lũy Kế',
                       revenue: tRev,
                       percent: percent,
                       commission: tRev * (percent / 100),
                       status: 'Chờ thanh toán'
                     });
                 }
             }
          }
       }
    });
  }

  commissionLogs.sort((a,b) => b.date.getTime() - a.date.getTime());

  if (loading) return <div className="flex-1 flex justify-center items-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

  return (
    <div className="space-y-8 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tighter text-slate-900 uppercase italic">Lịch sử hoa hồng</h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em] mt-1">Giao dịch hoa hồng phát sinh từ hệ thống</p>
        </div>
        <div className="flex items-center gap-4">
          <DateFilter onFilterChange={setDateRange} />
        </div>
      </div>

      <div className="bg-white p-6 rounded-[36px] border border-slate-100 shadow-sm">
        <div className="relative mb-6">
          <Search className="w-6 h-6 absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
          <input 
            type="text" 
            placeholder="Tìm theo người giới thiệu hoặc khách hàng..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-16 pr-6 py-4.5 bg-slate-50 border-none rounded-[24px] outline-none font-bold focus:ring-2 focus:ring-indigo-500/10 placeholder:text-slate-300"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] uppercase tracking-widest font-black text-slate-400">
                <th className="p-4">Ngày phát sinh</th>
                <th className="p-4">Người giới thiệu</th>
                <th className="p-4">Khách hàng</th>
                <th className="p-4">Mã đơn hàng</th>
                <th className="p-4 text-right">Doanh số</th>
                <th className="p-4 text-center">% Hoa hồng</th>
                <th className="p-4 text-right">Hoa hồng nhận</th>
                <th className="p-4 text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {commissionLogs.map((log, i) => (
                <tr key={log.id + i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 text-xs font-bold text-slate-600">{formatDate(log.date)}</td>
                  <td className="p-4 font-black text-indigo-600 uppercase text-xs">{log.referrerName}</td>
                  <td className="p-4 font-bold text-slate-900">{log.customerName}</td>
                  <td className="p-4 font-bold text-slate-500 text-xs">#{String(log.orderId).slice(-6).toUpperCase()}</td>
                  <td className="p-4 text-right font-black text-slate-700">{formatCurrency(log.revenue)}</td>
                  <td className="p-4 text-center font-black text-amber-500">{log.percent}%</td>
                  <td className="p-4 text-right font-black text-emerald-600">{formatCurrency(log.commission)}</td>
                  <td className="p-4 text-right">
                     <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${log.status === 'Đã duyệt' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                        {log.status}
                     </span>
                  </td>
                </tr>
              ))}
              {commissionLogs.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">Không có dữ liệu hoa hồng</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
