export interface Account {
  id: number;
  name: string;
  balance: string;
  balanceCents?: number;
  isDefault?: number | boolean;
  balance_cents?: number;
  is_default?: number | boolean;
  archived?: number | boolean;
}

export interface Liability {
  id: number;
  name: string;
  remaining: string;
  monthlyPayment: string;
  paymentDay?: number;
  payment_day?: number;
  archived?: number | boolean;
}

export interface Repayment {
  id: number;
  liability_id: number;
  amount_cents: number;
  amount?: string;
  occurred_on: string;
  account_id?: number;
  transaction_id?: number;
  created_by_user_id?: number;
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
