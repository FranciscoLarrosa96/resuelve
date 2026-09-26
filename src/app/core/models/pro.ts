export type ProPlan = 'free' | 'pro';

export interface WeekIncome {
  label: string;
  amount: number;
  previousAmount: number;
}

export interface ActivityItem {
  text: string;
  time: string;
  color: string;
}
