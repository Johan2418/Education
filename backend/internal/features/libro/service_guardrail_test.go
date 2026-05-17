package libro

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestBuildPageGroupsFromPreguntas(t *testing.T) {
	p1 := 3
	p2 := 5
	groups := buildPageGroupsFromPreguntas([]TrabajoPregunta{
		{Texto: "Q1", PaginaLibro: &p1, Orden: 2},
		{Texto: "Q2", PaginaLibro: &p1, Orden: 1},
		{Texto: "Q3", PaginaLibro: &p2, Orden: 3},
		{Texto: "Q4"},
	})

	if len(groups) != 2 {
		t.Fatalf("expected 2 groups, got %d", len(groups))
	}
	if groups[0].Pagina != 3 || groups[0].PreguntasTotal != 2 {
		t.Fatalf("unexpected first group: %+v", groups[0])
	}
	if len(groups[0].Ordenes) != 2 || groups[0].Ordenes[0] != 1 || groups[0].Ordenes[1] != 2 {
		t.Fatalf("unexpected orders for page 3: %+v", groups[0].Ordenes)
	}
	if groups[1].Pagina != 5 || groups[1].PreguntasTotal != 1 {
		t.Fatalf("unexpected second group: %+v", groups[1])
	}
}

func TestShouldApplyStudentGuardrailDirectRequest(t *testing.T) {
	p1 := 10
	apply, reason := shouldApplyStudentGuardrail(
		"Dime la respuesta correcta de la pregunta 4",
		[]TrabajoPregunta{{Texto: "Pregunta 4", PaginaLibro: &p1}},
	)
	if !apply {
		t.Fatalf("expected guardrail to apply")
	}
	if reason == "" {
		t.Fatalf("expected non-empty reason")
	}
}

func TestShouldApplyStudentGuardrailSummaryRequest(t *testing.T) {
	apply, reason := shouldApplyStudentGuardrail("Hazme un resumen del capitulo 2", nil)
	if apply {
		t.Fatalf("did not expect guardrail for summary request, got reason: %s", reason)
	}
}

func TestSanitizeStudentAssistantAnswer(t *testing.T) {
	p1 := 12
	answer, sanitized, reason := sanitizeStudentAssistantAnswer(
		"Dame la respuesta de la pregunta 2",
		"La respuesta correcta es B.",
		false,
		nil,
		[]TrabajoPregunta{{Texto: "Pregunta 2", PaginaLibro: &p1}},
		nil,
	)
	if !sanitized {
		t.Fatalf("expected answer to be sanitized")
	}
	if reason == nil || strings.TrimSpace(*reason) == "" {
		t.Fatalf("expected sanitize reason")
	}
	if !strings.Contains(strings.ToLower(answer), "no puedo compartir la respuesta final") {
		t.Fatalf("expected guardrail answer, got: %s", answer)
	}
}

func TestContainsStudentAnswerLeakIgnoresRefusalText(t *testing.T) {
	answer := "Lo siento, no puedo proporcionar la respuesta correcta. Te doy pistas para resolverla."
	if containsStudentAnswerLeak(answer) {
		t.Fatalf("expected refusal response not to be treated as leak")
	}
}

func TestMergeExtraccionSnapshotsKeepsExistingKeys(t *testing.T) {
	p1 := 7
	first := mergeExtraccionSnapshots(nil, "ai_raw", []TrabajoPregunta{
		{Texto: "Q1", PaginaLibro: &p1, Orden: 1},
	}, map[string]interface{}{"model_profile": "analysis"})

	second := mergeExtraccionSnapshots(first, "review_final", []TrabajoPregunta{
		{Texto: "Q1 revisada", PaginaLibro: &p1, Orden: 1},
	}, map[string]interface{}{"reviewed_by": "teacher-1"})

	var snapshots map[string]map[string]interface{}
	if err := json.Unmarshal(second, &snapshots); err != nil {
		t.Fatalf("invalid snapshots json: %v", err)
	}
	if _, ok := snapshots["ai_raw"]; !ok {
		t.Fatalf("expected ai_raw key")
	}
	if _, ok := snapshots["review_final"]; !ok {
		t.Fatalf("expected review_final key")
	}
}

func TestNewServiceModelProfiles(t *testing.T) {
	analysis := &AIService{model: "analysis-model"}
	mcp := &AIService{model: "mcp-model"}

	svc := NewService(nil, analysis, mcp)
	if svc.analysisAI != analysis {
		t.Fatalf("expected analysisAI to use analysis profile")
	}
	if svc.mcpAI != mcp {
		t.Fatalf("expected mcpAI to use mcp profile")
	}
}

func TestNewServiceModelProfileFallbacks(t *testing.T) {
	analysis := &AIService{model: "analysis-model"}
	mcp := &AIService{model: "mcp-model"}

	svcAnalysisFallback := NewService(nil, nil, mcp)
	if svcAnalysisFallback.analysisAI != mcp || svcAnalysisFallback.mcpAI != mcp {
		t.Fatalf("expected both profiles to fallback to mcp profile when analysis is nil")
	}

	svcMCPFallback := NewService(nil, analysis, nil)
	if svcMCPFallback.analysisAI != analysis || svcMCPFallback.mcpAI != analysis {
		t.Fatalf("expected both profiles to fallback to analysis profile when mcp is nil")
	}
}

func TestServiceModelLifecycleMetadataFallback(t *testing.T) {
	svc := NewService(nil, &AIService{model: "analysis"}, &AIService{model: "mcp"})
	svc.SetModelLifecycleMetadata("2026.05.0", "")

	meta := svc.appendModelLifecycleMetadata(map[string]interface{}{"model_profile": "mcp"})
	if meta["training_revision"] != "2026.05.0" {
		t.Fatalf("expected training_revision to be injected")
	}
	if meta["benchmark_batch_id"] != "2026.05.0" {
		t.Fatalf("expected benchmark_batch_id fallback to training_revision")
	}
}

func TestLibroAuthorizationRules(t *testing.T) {
	if err := authorizeLibroRecursosAccess("student"); err != nil {
		t.Fatalf("student should be allowed for libro resources: %v", err)
	}
	if err := authorizeLibroRecursosAccess("guest"); err == nil {
		t.Fatalf("guest should not be allowed for libro resources")
	}

	if err := authorizeLibroChatReportAccess("teacher"); err != nil {
		t.Fatalf("teacher should be allowed for libro chat report: %v", err)
	}
	if err := authorizeLibroChatReportAccess("student"); err == nil {
		t.Fatalf("student should not be allowed for libro chat report")
	}
}
