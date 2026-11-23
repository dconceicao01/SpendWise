package pt.spendwise.api.privacy;

import java.nio.charset.StandardCharsets;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
public class PersonalDataExportController {

    private final PersonalDataExportService exportService;

    public PersonalDataExportController(PersonalDataExportService exportService) {
        this.exportService = exportService;
    }

    @GetMapping("/export")
    public ResponseEntity<PersonalDataExport> export() {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("spendwise-data-export.json", StandardCharsets.UTF_8)
                        .build()
                        .toString())
                .cacheControl(CacheControl.noStore())
                .body(exportService.exportForCurrentUser());
    }
}
