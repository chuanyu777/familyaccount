package com.familyledger.controller;

import com.familyledger.auth.AuthGuard;
import com.familyledger.common.Params;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerRequest;
import com.familyledger.service.StatsService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stats")
public class StatsController {
  private final StatsService service; private final AuthGuard guard; private final LedgerAuthorization authorization;
  public StatsController(StatsService service, AuthGuard guard, LedgerAuthorization authorization) {
    this.service = service; this.guard = guard; this.authorization = authorization;
  }
  @GetMapping("/summary")
  public Map<String, Object> summary(HttpServletRequest request) {
    return service.summary(LedgerRequest.context(request, null, guard, authorization));
  }
  @GetMapping("/monthly-trend")
  public List<Map<String, Object>> trend(HttpServletRequest request, @RequestParam(value = "months", required = false) String months,
      @RequestParam(value = "end", required = false) String end) {
    int n = months == null ? 6 : Integer.parseInt(months);
    return service.monthlyTrend(LedgerRequest.context(request, null, guard, authorization), n,
        end == null ? null : Params.parseMonth(end, "end"));
  }
  @GetMapping("/category-breakdown")
  public List<Map<String, Object>> breakdown(HttpServletRequest request, @RequestParam(value = "month", required = false) String month) {
    return service.categoryBreakdown(LedgerRequest.context(request, null, guard, authorization),
        month == null ? null : Params.parseMonth(month, "month"));
  }
  @GetMapping("/monthly-snapshot")
  public Map<String, Object> snapshot(HttpServletRequest request, @RequestParam(value = "month", required = false) String month) {
    return service.monthSnapshot(LedgerRequest.context(request, null, guard, authorization),
        month == null ? null : Params.parseMonth(month, "month"));
  }
}
