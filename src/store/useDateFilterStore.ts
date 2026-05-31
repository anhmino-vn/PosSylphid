import { create } from 'zustand';
import { startOfDay, endOfDay } from 'date-fns';

export type DateFilterType = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface DateFilterState {
  filterType: DateFilterType;
  dateRange: DateRange;
  setFilter: (type: DateFilterType, range: DateRange) => void;
  setDateRange: (range: DateRange) => void;
}

export const useDateFilterStore = create<DateFilterState>((set) => {
  const today = new Date();
  return {
    filterType: 'today',
    dateRange: {
      startDate: startOfDay(today),
      endDate: endOfDay(today)
    },
    setFilter: (filterType, dateRange) => set({ filterType, dateRange }),
    setDateRange: (dateRange) => set({ dateRange, filterType: 'custom' })
  };
});
