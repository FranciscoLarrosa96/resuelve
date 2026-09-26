export interface AgendaEvent {
  id: string;
  /** 0 = lunes 21 … 6 = domingo 27 */
  day: number;
  /** Hora de inicio decimal: 9.5 = 9:30 */
  start: number;
  duration: number;
  title: string;
  zone: string;
  client: string;
  address: string;
  tentative?: boolean;
}

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
