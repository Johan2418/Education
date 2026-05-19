package libro

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/arcanea/backend/internal/config"
)

func TestSplitContentByPageMarkersProcessesAllPages(t *testing.T) {
	chunks := make([]string, 0, 200)
	for i := 1; i <= 200; i++ {
		chunks = append(chunks, fmt.Sprintf("[PAGINA %d]\nContenido de la pagina %d", i, i))
	}
	content := strings.Join(chunks, "\n\n")

	got := splitContentByPageMarkers(content, nil, nil, nil)
	if len(got) != 200 {
		t.Fatalf("expected 200 page chunks, got %d", len(got))
	}
	if got[0].Page != 1 {
		t.Fatalf("expected first page to be 1, got %d", got[0].Page)
	}
	if got[len(got)-1].Page != 200 {
		t.Fatalf("expected last page to be 200, got %d", got[len(got)-1].Page)
	}
	if !strings.Contains(got[199].Content, "pagina 200") {
		t.Fatalf("expected last chunk content to include page 200 text")
	}
}

func TestSplitContentByPageMarkersWithoutMarkersUsesSingleChunk(t *testing.T) {
	start := 5
	content := "Texto completo sin marcadores de pagina"

	got := splitContentByPageMarkers(content, &start, nil, nil)
	if len(got) != 1 {
		t.Fatalf("expected exactly 1 chunk, got %d", len(got))
	}
	if got[0].Page != 5 {
		t.Fatalf("expected page to be pagina_inicio (5), got %d", got[0].Page)
	}
	if got[0].Content != content {
		t.Fatalf("expected original content to remain intact")
	}
}

func TestSplitContentByPageMarkersKeepsImageByPage(t *testing.T) {
	content := "[PAGINA 48]\nTexto 48\n\n[PAGINA 49]\nTexto 49"
	imageByPage := map[int]string{
		49: "data:image/jpeg;base64,abc",
	}

	got := splitContentByPageMarkers(content, nil, imageByPage, nil)
	if len(got) != 2 {
		t.Fatalf("expected 2 chunks, got %d", len(got))
	}
	if got[0].ImageBase64 != nil {
		t.Fatalf("expected no image for page 48")
	}
	if got[1].ImageBase64 == nil {
		t.Fatalf("expected image for page 49")
	}
	if *got[1].ImageBase64 != "data:image/jpeg;base64,abc" {
		t.Fatalf("expected page 49 image to be preserved")
	}
}

func TestNormalizeSpanishTextRepairsMojibake(t *testing.T) {
	input := "La fotos\u00c3\u00adntesis ocurre en el cloroplasto. \u00c2\u00bfQu\u00c3\u00a9 produce?"
	got := normalizeSpanishText(input)

	if !strings.Contains(got, "fotosintesis") {
		t.Fatalf("expected normalized text to contain fotosintesis, got: %q", got)
	}
	if strings.Contains(got, "\u00c3") || strings.Contains(got, "\u00c2") {
		t.Fatalf("expected mojibake markers to be removed, got: %q", got)
	}
}

func TestNormalizeTipoPreguntaMapsNonCanonicalLabels(t *testing.T) {
	cases := map[string]string{
		"definicion":       "respuesta_corta",
		"escritura":        "respuesta_corta",
		"pregunta_abierta": "respuesta_corta",
		"multiple_choice":  "opcion_multiple",
		"VF":               "verdadero_falso",
	}

	for input, expected := range cases {
		got := normalizeTipoPregunta(input)
		if got != expected {
			t.Fatalf("normalizeTipoPregunta(%q) = %q, want %q", input, got, expected)
		}
	}
}

func TestParseModelQuestionsPayloadToleratesStringNumbers(t *testing.T) {
	raw := `[
		{
			"texto": "¿Qué es la fotosíntesis?",
			"tipo": "definicion",
			"opciones": [],
			"respuesta_correcta": "",
			"pagina_libro": "12",
			"confianza_ia": "0.91",
			"respuesta_esperada_tipo": "abierta",
			"placeholder": ""
		}
	]`

	items, err := parseModelQuestionsPayload(raw)
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0].PaginaLibro == nil || *items[0].PaginaLibro != 12 {
		t.Fatalf("expected pagina_libro=12, got %+v", items[0].PaginaLibro)
	}
	if items[0].ConfianzaIA == nil || *items[0].ConfianzaIA <= 0 {
		t.Fatalf("expected confianza_ia parsed, got %+v", items[0].ConfianzaIA)
	}
}

func TestIsLikelyEvaluableQuestionTextRejectsNoiseHeadings(t *testing.T) {
	ai := NewAIService(config.HuggingFaceConfig{})
	if ai.isLikelyEvaluableQuestionText("Pelicula: Noticia: Web:") {
		t.Fatalf("expected non-evaluable heading block to be rejected")
	}
}

func TestIsLikelyEvaluableQuestionTextAcceptsExercisePrompt(t *testing.T) {
	ai := NewAIService(config.HuggingFaceConfig{})
	text := "Lee la noticia anterior y responde: ¿Que es el microquimerismo?"
	if !ai.isLikelyEvaluableQuestionText(text) {
		t.Fatalf("expected evaluable prompt to pass filtering")
	}
}

func TestPassesConfidenceThresholdUsesConfiguredMinimum(t *testing.T) {
	ai := NewAIService(config.HuggingFaceConfig{
		LibroExtraction: config.LibroExtractionConfig{MinConfidence: 0.8},
	})
	low := 0.61
	high := 0.87

	if ai.passesConfidenceThreshold(&low) {
		t.Fatalf("expected low confidence question to be filtered out")
	}
	if !ai.passesConfidenceThreshold(&high) {
		t.Fatalf("expected high confidence question to pass")
	}
	if !ai.passesConfidenceThreshold(nil) {
		t.Fatalf("expected nil confidence to pass (backward compatibility)")
	}
}

func TestIsFaithfulQuestionTextHonorsConfiguredThresholds(t *testing.T) {
	ai := NewAIService(config.HuggingFaceConfig{
		LibroExtraction: config.LibroExtractionConfig{
			ShortFidelityMin: 0.9,
			LongFidelityMin:  0.9,
		},
	})
	source := "La mitosis tiene cuatro fases: profase, metafase, anafase y telofase."
	question := "Menciona tres fases de la mitosis."
	if ai.isFaithfulQuestionText(question, source) {
		t.Fatalf("expected strict fidelity thresholds to reject partial paraphrase")
	}
}

func TestHeuristicExtractSkipsPureTheoryContent(t *testing.T) {
	content := "Genoma y dotacion cromosomica. Esta informacion se localiza en un numero fijo de cromosomas."
	got := heuristicExtract(content, 5, nil, 20, 4, 28)
	if len(got) != 0 {
		t.Fatalf("expected no heuristic questions for pure theory content, got %d", len(got))
	}
}

func TestExtractQuestionCandidatesFromInlineMarkersDetectsFlattenedNumberedItems(t *testing.T) {
	content := "Autoevaluacion 1. Explica la funcion del ADN en la herencia biologica 2. Describe dos diferencias entre ADN y ARN 3. Justifica por que los genes influyen en los rasgos"
	got := extractQuestionCandidatesFromInlineMarkers(content, 20, 4)
	if len(got) < 2 {
		t.Fatalf("expected at least 2 inline candidates, got %d", len(got))
	}
}

func TestHeuristicExtractDetectsFlattenedNumberedItems(t *testing.T) {
	content := "1. Explica la funcion del ADN en la herencia biologica 2. Describe dos diferencias entre ADN y ARN 3. Justifica por que los genes influyen en los rasgos"
	got := heuristicExtract(content, 5, nil, 20, 4, 28)
	if len(got) < 2 {
		t.Fatalf("expected heuristic extraction to recover multiple numbered items, got %d", len(got))
	}
}

func TestParseModelQuestionsPayloadParsesRespuestaCorrecta(t *testing.T) {
	raw := `[
		{
			"texto": "La mitosis tiene fases. ¿Cuál es la fase final?",
			"tipo": "opcion_multiple",
			"opciones": ["Profase","Metafase","Anafase","Telofase"],
			"respuesta_correcta": "d",
			"pagina_libro": 8,
			"confianza_ia": 0.92
		}
	]`

	items, err := parseModelQuestionsPayload(raw)
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	if items[0].RespuestaCorrecta == nil || strings.TrimSpace(*items[0].RespuestaCorrecta) != "d" {
		t.Fatalf("expected respuesta_correcta=d, got %+v", items[0].RespuestaCorrecta)
	}
}

func TestNormalizeQuestionFormByModeFallsBackToOpenWhenClosedIsInvalid(t *testing.T) {
	options := json.RawMessage(`["A","B"]`)
	confLow := 0.51
	answer := "A"

	tipo, opts, correct := normalizeQuestionFormByMode(
		"opcion_multiple",
		options,
		&answer,
		&confLow,
		ModoFormularioMixtoAuto,
		0.72,
	)

	if tipo != "respuesta_corta" {
		t.Fatalf("expected fallback to respuesta_corta, got %q", tipo)
	}
	if string(opts) != "[]" {
		t.Fatalf("expected empty options in fallback, got %s", string(opts))
	}
	if correct != nil {
		t.Fatalf("expected nil correct answer in fallback, got %+v", correct)
	}
}

func TestNormalizeQuestionFormByModeKeepsValidClosedQuestion(t *testing.T) {
	options := json.RawMessage(`["Procariota","Eucariota"]`)
	answer := "2"
	conf := 0.91

	tipo, opts, correct := normalizeQuestionFormByMode(
		"opcion_multiple",
		options,
		&answer,
		&conf,
		ModoFormularioMixtoAuto,
		0.72,
	)

	if tipo != "opcion_multiple" {
		t.Fatalf("expected opcion_multiple, got %q", tipo)
	}
	if string(opts) == "[]" {
		t.Fatalf("expected normalized options")
	}
	if correct == nil || *correct != "Eucariota" {
		t.Fatalf("expected resolved correct answer Eucariota, got %+v", correct)
	}
}

func TestNormalizeQuestionFormByModeFallsBackWhenClosedAnswerDoesNotMatchOptions(t *testing.T) {
	options := json.RawMessage(`["Núcleo","Citoplasma"]`)
	answer := "Mitocondria"
	conf := 0.95

	tipo, opts, correct := normalizeQuestionFormByMode(
		"opcion_multiple",
		options,
		&answer,
		&conf,
		ModoFormularioMixtoAuto,
		0.72,
	)

	if tipo != "respuesta_corta" {
		t.Fatalf("expected fallback to respuesta_corta, got %q", tipo)
	}
	if string(opts) != "[]" {
		t.Fatalf("expected empty options on fallback, got %s", string(opts))
	}
	if correct != nil {
		t.Fatalf("expected nil correct answer on fallback, got %+v", correct)
	}
}
