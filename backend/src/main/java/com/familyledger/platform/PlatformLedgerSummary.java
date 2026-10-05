package com.familyledger.platform;

/** Platform-only list projection; memberCount includes active memberships. */
public record PlatformLedgerSummary(
    long id,
    String name,
    String createdAt,
    long ownerUserId,
    String ownerDisplayName,
    long memberCount,
    boolean webEnabled) {}
