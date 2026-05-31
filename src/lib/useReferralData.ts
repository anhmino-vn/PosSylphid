import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, doc, getDoc } from 'firebase/firestore';
import { db, Customer, Order } from './firebase';

export interface ReferralSettings {
  commissionMethod: 'PER_ORDER' | 'TOTAL_REVENUE';
  tiers: { min: number; max: number; percent: number }[];
}

export interface ReferrerData {
  customer: Customer;
  referredCustomers: Customer[];
  totalReferralRevenue: number;
  totalReferralOrders: number;
  totalCommission: number;
}

export function useReferralData() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<ReferralSettings>({
    commissionMethod: 'PER_ORDER',
    tiers: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let refs = 3;
    const unsubCustomers = onSnapshot(collection(db, 'customers'), snap => {
      setCustomers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)).filter(c => !(c as any).deletedAt && !(c as any).deleted_at && c.status !== 'inactive'));
      if (--refs === 0) setLoading(false);
    });

    const unsubOrders = onSnapshot(collection(db, 'orders'), snap => {
      setOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)).filter(o => !o.deletedAt && o.status === 'paid')); // Only paid orders count
      if (--refs === 0) setLoading(false);
    });

    const unsubSettings = onSnapshot(doc(db, 'system_configs', 'global'), snap => {
      if (snap.exists() && snap.data().referral) {
        setSettings(snap.data().referral);
      }
      if (--refs === 0) setLoading(false);
    });

    return () => {
      unsubCustomers();
      unsubOrders();
      unsubSettings();
    };
  }, []);

  const data = useMemo(() => {
    // Map to quickly find customers
    const customerMap = new Map<string, Customer>();
    customers.forEach(c => customerMap.set(c.id!, c));

    // Calculate spend per customer
    const spendPerCustomer = new Map<string, number>();
    const ordersPerCustomer = new Map<string, number>();
    orders.forEach(o => {
      if (!o.customerId) return;
      spendPerCustomer.set(o.customerId, (spendPerCustomer.get(o.customerId) || 0) + (o.totalAmount || 0));
      ordersPerCustomer.set(o.customerId, (ordersPerCustomer.get(o.customerId) || 0) + 1);
    });

    // We need to find who referred who
    const referrersMap = new Map<string, ReferrerData>();

    // Init map for everyone who referred someone
    customers.forEach(c => {
      if (c.referredById && customerMap.has(c.referredById)) {
        if (!referrersMap.has(c.referredById)) {
          referrersMap.set(c.referredById, {
            customer: customerMap.get(c.referredById)!,
            referredCustomers: [],
            totalReferralRevenue: 0,
            totalReferralOrders: 0,
            totalCommission: 0
          });
        }
        referrersMap.get(c.referredById)!.referredCustomers.push(c);
      }
    });

    // Helper to calculate tier % for a total amount
    const getCommissionPercent = (amount: number) => {
      if (!settings.tiers || settings.tiers.length === 0) return 0;
      // Sort tiers descending by min to find the highest applicable
      const sortedTiers = [...settings.tiers].sort((a, b) => b.min - a.min);
      for (const tier of sortedTiers) {
        if (amount >= tier.min) {
          return tier.percent;
        }
      }
      return 0;
    };

    // Calculate revenue and commission
    referrersMap.forEach((data, referrerId) => {
      let totalRev = 0;
      let totalOrders = 0;

      data.referredCustomers.forEach(refC => {
        const spend = spendPerCustomer.get(refC.id!) || 0;
        const ordCount = ordersPerCustomer.get(refC.id!) || 0;
        totalRev += spend;
        totalOrders += ordCount;
      });

      data.totalReferralRevenue = totalRev;
      data.totalReferralOrders = totalOrders;

      if (settings.commissionMethod === 'TOTAL_REVENUE') {
        const percent = getCommissionPercent(totalRev);
        data.totalCommission = totalRev * (percent / 100);
      } else {
        // PER_ORDER
        let comm = 0;
        data.referredCustomers.forEach(refC => {
           // Iterate all paid orders for this refC
           const customerOrders = orders.filter(o => o.customerId === refC.id);
           customerOrders.forEach(o => {
              const amt = o.totalAmount || 0;
              const percent = getCommissionPercent(amt);
              comm += amt * (percent / 100);
           });
        });
        data.totalCommission = comm;
      }
    });

    return {
      allCustomers: customers,
      allOrders: orders,
      customerMap,
      spendPerCustomer,
      ordersPerCustomer,
      referrersMap,
      settings,
      getCommissionPercent
    };
  }, [customers, orders, settings]);

  return { ...data, loading };
}
