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

export interface Asset {
  id: number;
  name: string;
  value: string;
  valueCents?: number;
  value_cents?: number;
  kind: string;
  updatedAt?: string;
  updated_at?: string;
  archived?: number | boolean;
}

/** 资产在某月底的市值快照 */
export interface AssetSnapshot {
  id: number;
  asset_id: number;
  month: string;
  valueCents?: number;
  value_cents?: number;
  value: string;
  note: string | null;
  recordedAt?: string;
  recorded_at?: string;
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
