import { Transaction } from '../types';

export function getTotalFoodSpending(items: Transaction[]): number {
  return items.filter((item) => item.category === 'food').reduce((sum, item) => sum + item.amount, 0);
}

export function getTravelSpending(items: Transaction[]): number {
  return items.filter((item) => item.category === 'travel').reduce((sum, item) => sum + item.amount, 0);
}

export function getMonthlySpending(items: Transaction[]) {
  const monthlyMap = new Map<string, number>();

  items.forEach((item) => {
    const monthKey = item.date === 'Unknown Date' ? 'Unknown' : item.date.split(' ').slice(1).join(' ');
    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + item.amount);
  });

  return Array.from(monthlyMap.entries()).map(([label, value]) => ({ label, value }));
}

export function getCategoryBreakdown(items: Transaction[]) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  if (total === 0) {
    return [];
  }

  const categoryMap = new Map<string, number>();
  items.forEach((item) => {
    categoryMap.set(item.category, (categoryMap.get(item.category) ?? 0) + item.amount);
  });

  const palette = {
    food: '#FF7A59',
    travel: '#4B7BEC',
    other: '#A55EEA',
  } as const;

  return Array.from(categoryMap.entries()).map(([name, amount]) => ({
    name,
    amount,
    color: palette[name as keyof typeof palette] ?? '#20BF6B',
    legendFontColor: '#1F2937',
    legendFontSize: 12,
  }));
}
