package com.familyledger.assistant;

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

  public AssistantController(AssistantConversationService conversations,
      AssistantOrchestrator orchestrator, AssistantActionService actions) {
    this.conversations = conversations;
    this.orchestrator = orchestrator;
    this.actions = actions;
  }

  @GetMapping("/conversations")
  public List<Map<String, Object>> list() {
    return conversations.list();
  }

  @PostMapping("/conversations")
  public Map<String, Object> create(@RequestBody(required = false) CreateConversationRequest request) {
    return conversations.create(null, null, request == null ? null : request.title());
  }

  @GetMapping("/conversations/{id}")
  public Map<String, Object> get(@PathVariable long id) {
    return conversations.get(id);
  }

  @GetMapping("/conversations/{id}/messages")
  public List<Map<String, Object>> messages(@PathVariable long id) {
    return conversations.messages(id);
  }

  @PostMapping("/conversations/{id}/messages")
  public Map<String, Object> append(@PathVariable long id, @RequestBody MessageRequest request) {
    return orchestrator.respond(id, request.content());
  }

  @PostMapping("/conversations/{id}/actions")
  public Map<String, Object> proposeAction(@PathVariable long id, @RequestBody ActionRequest request) {
    return actions.propose(id, request.actionType(), request.payload());
  }

  @GetMapping("/actions/{id}")
  public Map<String, Object> getAction(@PathVariable long id) { return actions.get(id); }

  @PostMapping("/actions/{id}/confirm")
  public Map<String, Object> confirmAction(@PathVariable long id) { return actions.confirm(id); }

  @PostMapping("/actions/{id}/cancel")
  public Map<String, Object> cancelAction(@PathVariable long id) {
    actions.cancel(id);
    return Map.of("ok", true);
  }

  public record CreateConversationRequest(String title) {}
  public record MessageRequest(String content) {}
  public record ActionRequest(String actionType, Map<String, Object> payload) {}
}
