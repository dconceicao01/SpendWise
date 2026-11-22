package pt.spendwise.api.budget;

import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/budgets/{budgetId}/allocation-sets")
public class AllocationSetController {

    private final AllocationSetService allocationService;

    public AllocationSetController(AllocationSetService allocationService) {
        this.allocationService = allocationService;
    }

    @GetMapping
    public List<AllocationSetResponse> list(@PathVariable UUID budgetId) {
        return allocationService.list(budgetId);
    }

    @PostMapping
    public ResponseEntity<AllocationSetResponse> createDraft(
            @PathVariable UUID budgetId, @Valid @RequestBody CreateAllocationSetRequest request) {
        AllocationSetResponse allocationSet = allocationService.createDraft(budgetId, request);
        return ResponseEntity.created(URI.create(
                "/api/v1/budgets/" + budgetId + "/allocation-sets/" + allocationSet.id()))
                .body(allocationSet);
    }

    @PutMapping("/{allocationSetId}/items")
    public AllocationSetResponse replaceDraftItems(
            @PathVariable UUID budgetId,
            @PathVariable UUID allocationSetId,
            @Valid @RequestBody ReplaceAllocationItemsRequest request) {
        return allocationService.replaceDraftItems(budgetId, allocationSetId, request);
    }

    @PostMapping("/{allocationSetId}/activate")
    public AllocationSetResponse activate(@PathVariable UUID budgetId, @PathVariable UUID allocationSetId) {
        return allocationService.activate(budgetId, allocationSetId);
    }
}
