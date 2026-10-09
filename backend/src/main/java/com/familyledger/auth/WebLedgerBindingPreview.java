package com.familyledger.auth;

/** 将某个 Web 账号导入当前微信账号前展示的账本摘要。 */
public record WebLedgerBindingPreview(long ledgerId, String ledgerName, String role) {}
