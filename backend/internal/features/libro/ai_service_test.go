package libro

import (
	"fmt"
	"strings"
	"testing"
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
