package bulkimport

// ─── Column Mapping (AI) ────────────────────────────────────

type ColumnMappingRequest struct {
	Headers []string `json:"headers"`
}

type FieldMapping struct {
	Header string `json:"header"`
	Field  string `json:"field"` // display_name | email | cedula | phone | ignore
}

type ColumnMappingResponse struct {
	Mappings []FieldMapping `json:"mappings"`
}

// ─── Admin Bulk Import ──────────────────────────────────────

type AdminBulkImportRequest struct {
	Mappings []FieldMapping           `json:"mappings"`
	Rows     []map[string]interface{} `json:"rows"`
	CursoID  *string                  `json:"curso_id,omitempty"`
}

type CreatedStudent struct {
	DisplayName       string `json:"display_name"`
	Email             string `json:"email"`
	Password          string `json:"password"`
	Cedula            string `json:"cedula,omitempty"`
	Status            string `json:"status"` // created | skipped
	Reason            string `json:"reason,omitempty"`
	EmailAutoAdjusted bool   `json:"email_auto_adjusted,omitempty"`
	EnrolledToCourse  bool   `json:"enrolled_to_course,omitempty"`
	EnrollmentReason  string `json:"enrollment_reason,omitempty"`
}

type AdminBulkImportResponse struct {
	Created []CreatedStudent `json:"created"`
	Skipped []CreatedStudent `json:"skipped"`
	Total   int              `json:"total"`
}

// ─── Teacher Bulk Import ────────────────────────────────────

type TeacherBulkImportRequest struct {
	Mappings []FieldMapping           `json:"mappings"`
	Rows     []map[string]interface{} `json:"rows"`
}

type EnrolledStudent struct {
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
	Status      string `json:"status"` // enrolled | already_enrolled | not_found
	Reason      string `json:"reason,omitempty"`
}

type TeacherBulkImportResponse struct {
	Enrolled []EnrolledStudent `json:"enrolled"`
	Skipped  []EnrolledStudent `json:"skipped"`
	NotFound []EnrolledStudent `json:"not_found"`
	Total    int               `json:"total"`
}
