package com.familyledger.auth;

/** 当前请求已经认证的主体；平台管理员和账本用户故意使用不同身份空间。 */
public record AuthPrincipal(PrincipalType type, Long userId, Long platformAdminId, boolean webSession) {
  public AuthPrincipal(PrincipalType type, Long userId, Long platformAdminId) {
    this(type, userId, platformAdminId, false);
  }

  public static AuthPrincipal ledgerUser(long userId) {
    return new AuthPrincipal(PrincipalType.LEDGER_USER, userId, null, false);
  }

  public static AuthPrincipal webLedgerUser(long userId) {
    return new AuthPrincipal(PrincipalType.LEDGER_USER, userId, null, true);
  }

  public static AuthPrincipal platformAdmin(long platformAdminId) {
    return new AuthPrincipal(PrincipalType.PLATFORM_ADMIN, null, platformAdminId, false);
  }
}
