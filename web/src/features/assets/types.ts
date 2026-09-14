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

export interface Asset {
  id: number;
  name: string;
  value: string;
  value_cents: number;
  kind: string;
  member_id?: number;
  updated_at: string;
  updated_by_member_id?: number;
}

/** 资产在某月底的市值快照 */
export interface AssetSnapshot {
  id: number;
  asset_id: number;
  month: string;
  value_cents: number;
  value: string;
  note: string | null;
  recorded_at: string;
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
