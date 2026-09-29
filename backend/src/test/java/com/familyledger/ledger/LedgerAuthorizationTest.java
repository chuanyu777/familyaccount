package com.familyledger.ledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.familyledger.TestDb;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.ApiException;
import com.familyledger.db.Seeder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class LedgerAuthorizationTest {
  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;
  @Autowired LedgerService ledgers;
  @Autowired LedgerAuthorization authorization;
  @Autowired InvitationService invitations;
  @Autowired LedgerMembershipService memberships;

  @BeforeEach
  void reset() {
    TestDb.reset(db);
    seeder.ensureSeeded();
  }

  @Test
  void createLedgerInitializesOnlyItsOwnResources() {
    long userId = insertUser("新用户");
    LedgerSummary summary = ledgers.createLedger(userId, "个人账本");

    assertThat(summary.name()).isEqualTo("个人账本");
    assertThat(db.queryForObject("SELECT COUNT(*) FROM ledger_membership WHERE ledger_id = ?", Integer.class,
        summary.id())).isEqualTo(1);
    assertThat(db.queryForObject("SELECT role FROM ledger_membership WHERE ledger_id = ?", String.class,
        summary.id())).isEqualTo("OWNER");
    assertThat(db.queryForObject("SELECT COUNT(*) FROM account WHERE ledger_id = ?", Integer.class,
        summary.id())).isEqualTo(1);
    assertThat(db.queryForObject("SELECT COUNT(*) FROM category WHERE ledger_id = ?", Integer.class,
        summary.id())).isEqualTo(2);
    assertThat(db.queryForObject("SELECT COUNT(*) FROM account WHERE ledger_id <> ?", Integer.class,
        summary.id())).isEqualTo(1);
  }

  @Test
  void membershipIsRequiredAndMemberCannotUseOwnerRules() {
    long specialLedgerId = specialLedgerId();
    long strangerId = insertUser("陌生人");

    LedgerContext context = authorization.requireMembership(
        AuthPrincipal.ledgerUser(ownerId()), specialLedgerId);
    assertThat(context.role()).isEqualTo("OWNER");
    assertThatThrownBy(() -> authorization.requireMembership(
        AuthPrincipal.ledgerUser(strangerId), specialLedgerId))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).getStatus()).isEqualTo(403));
    assertThatThrownBy(() -> authorization.requireOwner(
        AuthPrincipal.ledgerUser(memberId()), specialLedgerId))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).getStatus()).isEqualTo(403));
  }

  @Test
  void invitationAcceptsOnceAndDoesNotDuplicateMembership() {
    long userId = insertUser("受邀人");
    InvitationView invitation = invitations.create(ownerId(), specialLedgerId());

    LedgerMembershipView accepted = invitations.accept(userId, invitation.token());
    LedgerMembershipView repeated = invitations.accept(userId, invitation.token());

    assertThat(repeated.id()).isEqualTo(accepted.id());
    assertThat(db.queryForObject("SELECT COUNT(*) FROM ledger_membership WHERE ledger_id = ? AND user_id = ?",
        Integer.class, specialLedgerId(), userId)).isEqualTo(1);
  }

  @Test
  void revokedInvitationCannotBeAccepted() {
    long userId = insertUser("被撤销人");
    InvitationView invitation = invitations.create(ownerId(), specialLedgerId());
    invitations.revoke(ownerId(), invitation.id());

    assertThatThrownBy(() -> invitations.accept(userId, invitation.token()))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).getStatus()).isEqualTo(409));
  }

  @Test
  void ownerCannotLeaveOrRemoveItselfAndRemovalKeepsLedgerData() {
    long memberMembershipId = membershipId(memberId());
    assertThatThrownBy(() -> memberships.remove(ownerId(), membershipId(ownerId())))
        .isInstanceOf(ApiException.class);
    assertThatThrownBy(() -> memberships.leave(ownerId(), specialLedgerId()))
        .isInstanceOf(ApiException.class);

    memberships.remove(ownerId(), memberMembershipId);
    assertThat(db.queryForObject("SELECT active FROM ledger_membership WHERE id = ?", Integer.class,
        memberMembershipId)).isZero();
    assertThat(db.queryForObject("SELECT COUNT(*) FROM account WHERE ledger_id = ?", Integer.class,
        specialLedgerId())).isEqualTo(1);
  }

  private long ownerId() {
    return db.queryForObject("SELECT user_id FROM ledger_membership WHERE role = 'OWNER'", Long.class);
  }

  private long memberId() {
    return db.queryForObject("SELECT user_id FROM ledger_membership WHERE role = 'MEMBER'", Long.class);
  }

  private long membershipId(long userId) {
    return db.queryForObject("SELECT id FROM ledger_membership WHERE ledger_id = ? AND user_id = ?",
        Long.class, specialLedgerId(), userId);
  }

  private long specialLedgerId() {
    return db.queryForObject("SELECT id FROM ledger WHERE is_web_enabled = 1", Long.class);
  }

  private long insertUser(String displayName) {
    return com.familyledger.common.Db.insert(db,
        "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)", displayName,
        com.familyledger.common.Time.now());
  }
}
