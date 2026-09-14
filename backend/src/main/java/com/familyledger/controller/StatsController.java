package com.familyledger.controller;

import com.familyledger.common.Params;
import com.familyledger.service.StatsService;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stats")
public class StatsController {
  private final StatsService service;

  public StatsController(StatsService service) {
    this.service = service;
  }

  @GetMapping("/summary")
  public Map<String, Object> summary() {
    return service.summary();
  }

  @GetMapping("/monthly-trend")
  public List<Map<String, Object>> monthlyTrend(
      @RequestParam(value = "months", required = false) String months,
      @RequestParam(value = "end", required = false) String end) {
    int n = 6;
    if (months != null && !months.isEmpty()) {
      n = Integer.parseInt(months);
      if (n < 1 || n > 24) throw new com.familyledger.common.ApiException(400, "VALIDATION_FAILED", "months 需在 1-24");
    }
    String e = end == null ? null : Params.parseMonth(end, "end");
    return service.monthlyTrend(n, e);
  }

  @GetMapping("/category-breakdown")
  public List<Map<String, Object>> categoryBreakdown(@RequestParam(value = "month", required = false) String month) {
    return service.categoryBreakdown(month == null ? null : Params.parseMonth(month, "month"));
  }

  @GetMapping("/monthly-snapshot")
  public Map<String, Object> monthlySnapshot(@RequestParam(value = "month", required = false) String month) {
    return service.monthSnapshot(month == null ? null : Params.parseMonth(month, "month"));
  }
}
