package com.familyledger.assistant;

import com.familyledger.auth.AuthGuard;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.ledger.LedgerRequest;
import jakarta.servlet.http.HttpServletRequest;
import java.time.ZoneId;
import com.familyledger.common.MonthUtil;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 助手会话 API；实际 Agent 调用将在下一步接入 Agent Runtime。 */
@RestController
@RequestMapping("/api/assistant")
public class AssistantController {
  private final AssistantConversationService conversations;
  private final AssistantOrchestrator orchestrator;
  private final AssistantActionService actions;
  private final AuthGuard guard;
  private final LedgerAuthorization authorization;

  public AssistantController(AssistantConversationService conversations,
      AssistantOrchestrator orchestrator, AssistantActionService actions, AuthGuard guard,
      LedgerAuthorization authorization) {
    this.conversations = conversations;
    this.orchestrator = orchestrator;
    this.actions = actions;
    this.guard = guard;
    this.authorization = authorization;
  }

  @GetMapping("/conversations")
  public List<Map<String, Object>> list(HttpServletRequest request) {
    LedgerContext context = ledgerContext(request);
    return conversations.list(context.userId(), context.ledgerId());
  }

  @PostMapping("/conversations")
  public Map<String, Object> create(HttpServletRequest httpRequest,
      @RequestBody(required = false) CreateConversationRequest request) {
    LedgerContext context = ledgerContext(httpRequest);
    return conversations.create(context.userId(), context.ledgerId(), request == null ? null : request.title());
  }

  @GetMapping("/conversations/{id}")
  public Map<String, Object> get(@PathVariable long id, HttpServletRequest request) {
    LedgerContext context = ledgerContext(request);
    return conversations.get(id, context.userId(), context.ledgerId());
  }

  @GetMapping("/conversations/{id}/messages")
  public List<Map<String, Object>> messages(@PathVariable long id, HttpServletRequest request) {
    LedgerContext context = ledgerContext(request);
    return conversations.messages(id, context.userId(), context.ledgerId());
  }

  @PostMapping("/conversations/{id}/messages")
  public Map<String, Object> append(@PathVariable long id, HttpServletRequest httpRequest,
      @RequestBody MessageRequest request) {
    return orchestrator.respond(id, request.content(), assistantContext(httpRequest, id));
  }

  @PostMapping("/conversations/{id}/actions")
  public Map<String, Object> proposeAction(@PathVariable long id, HttpServletRequest httpRequest,
      @RequestBody ActionRequest request) {
    LedgerContext context = ledgerContext(httpRequest);
    return actions.propose(id, request.actionType(), request.payload(),
        context.userId(), context.ledgerId());
  }

  @GetMapping("/actions/{id}")
  public Map<String, Object> getAction(@PathVariable long id, HttpServletRequest request) {
    LedgerContext context = ledgerContext(request);
    return actions.get(id, context.userId(), context.ledgerId());
  }

  @PostMapping("/actions/{id}/confirm")
  public Map<String, Object> confirmAction(@PathVariable long id, HttpServletRequest request) {
    AuthPrincipal principal = guard.requireLedgerUser(request);
    return actions.confirm(id, principal, ledgerContext(request));
  }

  @PostMapping("/actions/{id}/cancel")
  public Map<String, Object> cancelAction(@PathVariable long id, HttpServletRequest request) {
    LedgerContext context = ledgerContext(request);
    actions.cancel(id, context.userId(), context.ledgerId());
    return Map.of("ok", true);
  }

  private LedgerContext ledgerContext(HttpServletRequest request) {
    return LedgerRequest.context(request, null, guard, authorization);
  }

  private AssistantContext assistantContext(HttpServletRequest request, long conversationId) {
    AuthPrincipal principal = guard.requireLedgerUser(request);
    LedgerContext context = ledgerContext(request);
    return new AssistantContext("local-" + conversationId, principal.userId(), context.ledgerId(),
        ZoneId.of("Asia/Shanghai"), MonthUtil.currentMonth());
  }

  public record CreateConversationRequest(String title) {}
  public record MessageRequest(String content) {}
  public record ActionRequest(String actionType, Map<String, Object> payload) {}
}
