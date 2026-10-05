export interface PlatformLedgerSummary {
  id: number;
  name: string;
  createdAt: string;
  ownerUserId: number;
  ownerDisplayName: string;
  memberCount: number;
  webEnabled: boolean;
}

export interface PlatformLedgerView {
  ledger: {
    id: number;
    name: string;
    isWebEnabled: number;
    createdByUserId: number;
    createdAt: string;
  };
  members: Array<{ id: number; userId: number; displayName: string; role: string; webLoginAllowed: number; active: number; joinedAt: string }>;
  accounts: Array<{ id: number; name: string; balanceCents: number; isDefault: number; archived: number; createdAt: string }>;
  categories: Array<{ id: number; kind: string; name: string; archived: number; createdAt: string }>;
  transactions: Array<{ id: number; type: string; amountCents: number; occurredOn: string; note: string | null; accountId: number; toAccountId: number | null; categoryId: number | null; createdByUserId: number; sourceType: string; createdAt: string }>;
  assets: Array<{ id: number; name: string; valueCents: number; kind: string; archived: number; updatedAt: string }>;
  liabilities: Array<{ id: number; name: string; remainingCents: number; monthlyPaymentCents: number; paymentDay: number | null; archived: number; createdAt: string }>;
  repayments: Array<{ id: number; liabilityId: number; amountCents: number; occurredOn: string; accountId: number; transactionId: number; createdByUserId: number; createdAt: string }>;
  snapshots: Array<{ id: number; assetId: number; snapMonth: string; valueCents: number; note: string | null; recordedAt: string }>;
  analysis: {
    memberCount: number;
    transactionCount: number;
    repaymentCount: number;
    incomeCents: number;
    expenseCents: number;
    netCents: number;
    accountBalanceCents: number;
    assetValueCents: number;
    liabilityRemainingCents: number;
  };
}
