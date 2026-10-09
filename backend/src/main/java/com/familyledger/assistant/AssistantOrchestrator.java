package com.familyledger.assistant;

import com.familyledger.common.MonthUtil;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Agent Runtime 的应用层端口。
 *
 * <p>在 LangChain 服务接入前提供一个确定性的本地 fallback，让 Web/小程序可以先完成
 * 会话、消息和结果块的联调。后续只替换本类的 runtime 分支，不改变 API 合约。</p>
 */
@Service
public class AssistantOrchestrator {
  private final AssistantToolFacade tools;
  private final AssistantConversationService conversations;
  private final AssistantAgentClient agent;

  public AssistantOrchestrator(AssistantToolFacade tools,
      AssistantConversationService conversations, AssistantAgentClient agent) {
    this.tools = tools;
    this.conversations = conversations;
    this.agent = agent;
  }

  public Map<String, Object> respond(long conversationId, String content) {
    conversations.appendUserMessage(conversationId, content);
    String month = MonthUtil.currentMonth();
    AssistantContext context = new AssistantContext("local-" + conversationId, null, null,
        ZoneId.of("Asia/Shanghai"), month);
    Map<String, Object> runtime = agent.run(content, context);
    if (runtime != null && runtime.get("content") != null) {
      return conversations.appendAssistantMessage(conversationId,
          String.valueOf(runtime.get("content")), runtime.get("blocks"));
    }
    String normalized = content.toLowerCase(Locale.ROOT);
    Map<String, Object> block = new LinkedHashMap<>();
    String text;
    if (normalized.contains("分类") || normalized.contains("花在哪")) {
      Object data = tools.getCategoryBreakdown(context, month).get("data");
      text = "这是本月支出分类，可以继续问我某个分类的明细。";
      block.put("type", "category_breakdown");
      block.put("data", data);
    } else if (normalized.contains("账户") || normalized.contains("余额")) {
      Object data = tools.listAccounts(context).get("data");
      text = "这是当前账户余额。";
      block.put("type", "account_list");
      block.put("data", data);
    } else if (normalized.contains("资产") || normalized.contains("负债") || normalized.contains("净资产")) {
      Object data = tools.getLedgerOverview(context).get("data");
      text = "这是当前家庭资产负债概览。";
      block.put("type", "metric");
      block.put("data", data);
    } else if (normalized.contains("支出") || normalized.contains("收入") || normalized.contains("本月")) {
      Object data = tools.getPeriodSummary(context, month).get("data");
      text = "这是本月收支汇总。";
      block.put("type", "metric");
      block.put("data", data);
    } else {
      text = "我可以帮你查询本月收支、支出分类、账户余额和资产负债。试试问“本月花了多少”或“钱都花在哪些分类”。";
      block.put("type", "text");
      block.put("suggestions", List.of("本月花了多少？", "钱都花在哪些分类？", "看看账户余额"));
    }
    return conversations.appendAssistantMessage(conversationId, text, List.of(block));
  }
}
