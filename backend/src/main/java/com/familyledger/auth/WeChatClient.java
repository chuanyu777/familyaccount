package com.familyledger.auth;

public interface WeChatClient {
  WeChatIdentity exchangeLoginCode(String code);

  record WeChatIdentity(String openid, String displayName) {
    public WeChatIdentity(String openid) { this(openid, "微信用户"); }
  }
}
