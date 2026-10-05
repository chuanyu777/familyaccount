export interface MiniSession {
  cookie: string;
  userId?: number;
}

export interface LedgerSummary {
  id: number;
  name: string;
  role: string;
}

export interface LedgerMembership {
  id: number;
  ledgerId: number;
  userId: number;
  role: string;
  active: boolean;
  displayName: string;
}

export interface InvitationView {
  id: number;
  ledgerId: number;
  token: string;
  expiresAt: string;
}
