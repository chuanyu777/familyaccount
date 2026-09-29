package com.familyledger.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Transitional dependency for the not-yet-migrated business services.
 *
 * <p>No controller exposes this legacy member model. Task 4 removes the remaining callers when
 * those services become ledger-scoped and user-attributed.
 */
@Deprecated
@Service
public class MemberService {
  private final JdbcTemplate db;

  public MemberService(JdbcTemplate db) { this.db = db; }

  public boolean exists(long id) {
    Long count = db.queryForObject("SELECT COUNT(*) FROM member WHERE id = ?", Long.class, id);
    return count != null && count > 0;
  }
}
