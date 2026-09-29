package com.familyledger.ledger;

public record LedgerMembershipView(long id, long ledgerId, long userId, String role,
                                   boolean active, String displayName) {}
