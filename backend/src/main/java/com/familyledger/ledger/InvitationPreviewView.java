package com.familyledger.ledger;

public record InvitationPreviewView(
    long ledgerId,
    String ledgerName,
    String inviterName,
    String expiresAt) {}
