package com.familyledger.ledger;

public record LedgerContext(long ledgerId, long userId, String role, boolean webLoginAllowed) {
  public boolean isOwner() { return "OWNER".equals(role); }
}
