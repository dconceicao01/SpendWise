package pt.spendwise.api.privacy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.IntFunction;
import org.springframework.stereotype.Service;
import pt.spendwise.api.budget.AllocationSetService;
import pt.spendwise.api.budget.BudgetCategoryService;
import pt.spendwise.api.budget.BudgetMovementService;
import pt.spendwise.api.budget.BudgetPeriodService;
import pt.spendwise.api.budget.BudgetResponse;
import pt.spendwise.api.budget.BudgetService;
import pt.spendwise.api.budget.IncomeScheduleResponse;
import pt.spendwise.api.budget.IncomeScheduleService;
import pt.spendwise.api.budget.ExpenseLabelService;

@Service
public class PersonalDataExportService {

    private static final int PAGE_SIZE = 100;

    private final PrivacyExportRepository exportRepository;
    private final BudgetService budgetService;
    private final BudgetPeriodService periodService;
    private final BudgetCategoryService categoryService;
    private final AllocationSetService allocationService;
    private final BudgetMovementService movementService;
    private final IncomeScheduleService scheduleService;
    private final ExpenseLabelService expenseLabelService;

    public PersonalDataExportService(
            PrivacyExportRepository exportRepository,
            BudgetService budgetService,
            BudgetPeriodService periodService,
            BudgetCategoryService categoryService,
            AllocationSetService allocationService,
            BudgetMovementService movementService,
            IncomeScheduleService scheduleService,
            ExpenseLabelService expenseLabelService) {
        this.exportRepository = exportRepository;
        this.budgetService = budgetService;
        this.periodService = periodService;
        this.categoryService = categoryService;
        this.allocationService = allocationService;
        this.movementService = movementService;
        this.scheduleService = scheduleService;
        this.expenseLabelService = expenseLabelService;
    }

    public PersonalDataExport exportForCurrentUser() {
        ExportProfile profile = exportRepository.findCurrentUserProfile().orElse(null);
        List<BudgetDataExport> budgets = budgetService.listForCurrentUser().stream()
                .map(this::exportBudget)
                .toList();
        return new PersonalDataExport(Instant.now(), profile, budgets);
    }

    private BudgetDataExport exportBudget(BudgetResponse budget) {
        UUID budgetId = budget.id();
        var categories = categoryService.list(budgetId);
        return new BudgetDataExport(
                budget,
                periodService.list(budgetId),
                categories,
                categories.stream()
                        .flatMap(category -> expenseLabelService.list(budgetId, category.id()).stream())
                        .toList(),
                allocationService.list(budgetId),
                allPages(offset -> movementService.listIncomes(budgetId, null, PAGE_SIZE, offset)).stream()
                        .map(row -> new ExportIncome(row.id(), row.periodId(), row.amount(), row.occurredOn(),
                                row.createdAt(), row.allocationSnapshot()))
                        .toList(),
                allPages(offset -> movementService.listExpenses(budgetId, null, PAGE_SIZE, offset)).stream()
                        .map(row -> new ExportExpense(row.id(), row.periodId(), row.categoryId(), row.labelId(),
                                row.label() == null ? null : row.label().name(), row.amount(),
                                row.spentOn(), row.description(), row.invoiceStatus(), row.supplierNipc(), row.createdAt()))
                        .toList(),
                allPages(offset -> movementService.listAdjustments(budgetId, null, PAGE_SIZE, offset)).stream()
                        .map(row -> new ExportAdjustment(row.id(), row.periodId(), row.categoryId(),
                                row.correctedExpenseEntryId(), row.amountDelta(), row.reason(), row.occurredOn(),
                                row.createdAt()))
                        .toList(),
                allPages(offset -> movementService.listIncomeCorrections(budgetId, null, PAGE_SIZE, offset)).stream()
                        .map(row -> new ExportIncomeCorrection(row.id(), row.incomeEntryId(), row.periodId(),
                                row.allocationSetId(), row.amountDelta(), row.reason(), row.occurredOn(), row.createdAt(),
                                row.allocationSnapshot()))
                        .toList(),
                allPages(offset -> scheduleService.list(budgetId, PAGE_SIZE, offset)).stream()
                        .map(this::exportSchedule)
                        .toList());
    }

    private ExportIncomeSchedule exportSchedule(IncomeScheduleResponse row) {
        return new ExportIncomeSchedule(row.id(), row.amount(), row.frequency(), row.monthlyShortMonthBehavior(),
                row.startDate(), row.endDate(), row.nextOccurrenceOn(), row.status(), row.createdAt(), row.updatedAt());
    }

    private <T> List<T> allPages(IntFunction<List<T>> pageLoader) {
        List<T> result = new ArrayList<>();
        int offset = 0;
        while (true) {
            List<T> page = pageLoader.apply(offset);
            if (page == null || page.isEmpty()) {
                return List.copyOf(result);
            }
            result.addAll(page);
            if (page.size() < PAGE_SIZE) {
                return List.copyOf(result);
            }
            offset = Math.addExact(offset, page.size());
        }
    }
}
