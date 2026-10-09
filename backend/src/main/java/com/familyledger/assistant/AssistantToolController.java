package com.familyledger.assistant;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Agent Runtime 的内部工具适配器。生产环境必须配置 assistant.internal-token。 */
@RestController
@RequestMapping("/api/assistant/internal/tools")
public class AssistantToolController {
  private final AssistantToolFacade tools;
  private final String internalToken;

  public AssistantToolController(AssistantToolFacade tools,
      @Value("${assistant.internal-token:}") String internalToken) {
    this.tools = tools;
    this.internalToken = internalToken;
  }

  @PostMapping("/{name}")
  public Map<String, Object> call(String name,
      @RequestHeader(value = "X-Assistant-Internal-Token", required = false) String token,
      @RequestBody ToolRequest request) {
    if (!internalToken.isBlank() && !internalToken.equals(token)) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid assistant runtime token");
    }
    AssistantContext context = new AssistantContext(
        String.valueOf(request.context().getOrDefault("run_id", "runtime")),
        number(request.context().get("user_id")), number(request.context().get("ledger_id")),
        java.time.ZoneId.of("Asia/Shanghai"), string(request.params().get("month")));
    return switch (name) {
      case "get_period_summary" -> tools.getPeriodSummary(context, string(request.params().get("month")));
      case "get_category_breakdown" -> tools.getCategoryBreakdown(context, string(request.params().get("month")));
      case "list_accounts" -> tools.listAccounts(context);
      case "get_ledger_overview" -> tools.getLedgerOverview(context);
      default -> throw new ResponseStatusException(HttpStatus.NOT_FOUND, "unknown assistant tool");
    };
  }

  private static Long number(Object value) { return value instanceof Number n ? n.longValue() : null; }
  private static String string(Object value) { return value == null ? null : String.valueOf(value); }
  public record ToolRequest(Map<String, Object> context, Map<String, Object> params) {}
}
