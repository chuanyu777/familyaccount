package com.familyledger.ledger;

import com.familyledger.auth.AuthGuard;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.Params;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class InvitationController {
  private final AuthGuard guard;
  private final InvitationService invitations;
  private final LedgerMembershipService memberships;

  public InvitationController(AuthGuard guard, InvitationService invitations,
      LedgerMembershipService memberships) {
    this.guard = guard;
    this.invitations = invitations;
    this.memberships = memberships;
  }

  @PostMapping("/api/ledgers/{ledgerId}/invitations")
  public ResponseEntity<InvitationView> create(@PathVariable Object ledgerId,
      HttpServletRequest request) {
    AuthPrincipal principal = guard.requireLedgerUser(request);
    InvitationView result = invitations.create(principal, Params.parseId(ledgerId));
    return ResponseEntity.status(HttpStatus.CREATED).body(result);
  }

  @PostMapping("/api/invitations/accept")
  public LedgerMembershipView accept(HttpServletRequest request,
      @RequestBody(required = false) Map<String, Object> body) {
    AuthPrincipal principal = guard.requireLedgerUser(request);
    return invitations.accept(principal, text(body, "token"));
  }

  @GetMapping("/api/invitations/preview")
  public InvitationPreviewView preview(@RequestParam(required = false) String token,
      HttpServletRequest request) {
    guard.requireLedgerUser(request);
    return invitations.preview(token);
  }

  @PostMapping("/api/invitations/{id}/revoke")
  public ResponseEntity<Void> revoke(@PathVariable Object id, HttpServletRequest request) {
    invitations.revoke(guard.requireLedgerUser(request), Params.parseId(id));
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/api/ledgers/{ledgerId}/members")
  public List<LedgerMembershipView> members(@PathVariable Object ledgerId, HttpServletRequest request) {
    return memberships.list(guard.requireLedgerUser(request), Params.parseId(ledgerId));
  }

  @DeleteMapping("/api/memberships/{id}")
  public ResponseEntity<Void> remove(@PathVariable Object id, HttpServletRequest request) {
    memberships.remove(guard.requireLedgerUser(request), Params.parseId(id));
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/api/ledgers/{ledgerId}/leave")
  public ResponseEntity<Void> leave(@PathVariable Object ledgerId, HttpServletRequest request) {
    memberships.leave(guard.requireLedgerUser(request), Params.parseId(ledgerId));
    return ResponseEntity.noContent().build();
  }

  private static String text(Map<String, Object> body, String key) {
    Object value = body == null ? null : body.get(key);
    return value == null ? null : String.valueOf(value);
  }
}
