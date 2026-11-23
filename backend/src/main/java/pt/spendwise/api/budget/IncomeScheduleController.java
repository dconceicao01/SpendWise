package pt.spendwise.api.budget;

import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/budgets/{budgetId}/income-schedules")
public class IncomeScheduleController {

    private final IncomeScheduleService scheduleService;

    public IncomeScheduleController(IncomeScheduleService scheduleService) {
        this.scheduleService = scheduleService;
    }

    @GetMapping
    public List<IncomeScheduleResponse> list(
            @PathVariable UUID budgetId,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        return scheduleService.list(budgetId, limit, offset);
    }

    @PostMapping
    public ResponseEntity<IncomeScheduleResponse> create(
            @PathVariable UUID budgetId,
            @Valid @RequestBody CreateIncomeScheduleRequest request) {
        IncomeScheduleResponse schedule = scheduleService.create(budgetId, request);
        return ResponseEntity.created(URI.create(
                "/api/v1/budgets/" + budgetId + "/income-schedules/" + schedule.id()))
                .body(schedule);
    }

    @PatchMapping("/{scheduleId}")
    public IncomeScheduleResponse updateStatus(
            @PathVariable UUID budgetId,
            @PathVariable UUID scheduleId,
            @Valid @RequestBody UpdateIncomeScheduleStatusRequest request) {
        return scheduleService.updateStatus(budgetId, scheduleId, request);
    }
}
