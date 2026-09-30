package com.familyledger.platform;

import java.util.List;
import java.util.Map;

/** Read-only ledger projection for the platform operations console. */
public record PlatformLedgerView(
    Map<String, Object> ledger,
    List<Map<String, Object>> members,
    List<Map<String, Object>> accounts,
    List<Map<String, Object>> categories,
    List<Map<String, Object>> transactions,
    List<Map<String, Object>> assets,
    List<Map<String, Object>> liabilities,
    List<Map<String, Object>> repayments,
    List<Map<String, Object>> snapshots,
    Map<String, Object> analysis) {}
