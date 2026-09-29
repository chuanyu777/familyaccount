package com.familyledger.auth;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.stereotype.Component;

@Component
public class PasswordHasher {
  private static final String ALGORITHM = "PBKDF2WithHmacSHA256";
  private static final int ITERATIONS = 120_000;
  private static final int HASH_BITS = 256;
  private static final int SALT_BYTES = 16;

  private final SecureRandom random = new SecureRandom();

  public String hash(String password) {
    if (password == null || password.isEmpty()) {
      throw new IllegalArgumentException("password must not be empty");
    }
    byte[] salt = new byte[SALT_BYTES];
    random.nextBytes(salt);
    byte[] hash = derive(password, salt, ITERATIONS, HASH_BITS);
    return "pbkdf2-sha256$" + ITERATIONS + "$"
        + Base64.getEncoder().encodeToString(salt) + "$"
        + Base64.getEncoder().encodeToString(hash);
  }

  public boolean matches(String password, String encoded) {
    if (password == null || encoded == null) return false;
    String[] parts = encoded.split("\\$", -1);
    if (parts.length != 4 || !"pbkdf2-sha256".equals(parts[0])) return false;
    try {
      int iterations = Integer.parseInt(parts[1]);
      byte[] salt = Base64.getDecoder().decode(parts[2]);
      byte[] expected = Base64.getDecoder().decode(parts[3]);
      byte[] actual = derive(password, salt, iterations, expected.length * 8);
      return MessageDigest.isEqual(actual, expected);
    } catch (RuntimeException e) {
      return false;
    }
  }

  private static byte[] derive(String password, byte[] salt, int iterations, int bits) {
    try {
      PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, bits);
      return SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).getEncoded();
    } catch (Exception e) {
      throw new IllegalStateException("密码哈希失败", e);
    }
  }
}
