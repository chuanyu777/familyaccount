export interface Member {
  id: number;
  name: string;
  color?: string;
}

export interface Account {
  id: number;
  name: string;
  balance: string;
  balance_cents: number;
  member_id?: number;
  is_default: boolean;
}

export interface Liability {
  id: number;
  name: string;
  remaining: string;
  monthlyPayment: string;
  payment_day: number;
  member_id?: number;
}

export interface Repayment {
  id: number;
  liability_id: number;
  amount_cents: number;
  amount?: string;
  occurred_on: string;
  account_id?: number;
  transaction_id?: number;
}

export interface Summary {
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  netWorthCents: number;
  monthlyPaymentTotalCents: number;
  accountsTotalCents: number;
  assetsTotalCents: number;
  [k: string]: number | string;
}
