package libro

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/arcanea/backend/internal/config"
)

type AIService struct {
	apiKey     string
	model      string
	httpClient *http.Client
}

type pageChunk struct {
	Page    int
	Content string
}

func NewAIService(cfg config.HuggingFaceConfig) *AIService {
	return &AIService{
		apiKey: cfg.APIKey,
		model:  cfg.Model,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (s *AIService) ExtractQuestions(ctx context.Context, req ExtractLibroRequest) ([]TrabajoPregunta, bool, string, error) {
	maxPreguntas := 10
	if req.MaxPreguntas != nil && *req.MaxPreguntas > 0 && *req.MaxPreguntas <= 30 {
		maxPreguntas = *req.MaxPreguntas
	}

	if strings.TrimSpace(req.Contenido) == "" {
		return nil, false, "", fmt.Errorf("contenido es requerido para extraer preguntas")
	}

	chunks := splitContentByPageMarkers(req.Contenido, req.PaginaInicio)
	if len(chunks) > 1 {
		return s.extractQuestionsByPageChunks(ctx, chunks, maxPreguntas)
	}

	if s.apiKey == "" {
		preguntas := heuristicExtract(req.Contenido, maxPreguntas, req.PaginaInicio)
		return preguntas, true, "sin API key de libro, se uso fallback heuristico", nil
	}

	prompt := buildExtractionPrompt(req.Contenido, maxPreguntas)
	preguntas, err := s.aiExtractChat(ctx, prompt, req.Contenido)
	if err != nil {
		fallback := heuristicExtract(req.Contenido, maxPreguntas, req.PaginaInicio)
		return fallback, true, "fallo IA, se uso fallback heuristico", nil
	}

	if len(preguntas) == 0 {
		fallback := heuristicExtract(req.Contenido, maxPreguntas, req.PaginaInicio)
		return fallback, true, "IA devolvio vacio, se uso fallback heuristico", nil
	}

	return preguntas, false, "extraccion IA completada", nil
}

func (s *AIService) extractQuestionsByPageChunks(ctx context.Context, chunks []pageChunk, maxPreguntas int) ([]TrabajoPregunta, bool, string, error) {
	all := make([]TrabajoPregunta, 0, maxPreguntas)
	usedFallback := false

	for _, chunk := range chunks {
		if len(all) >= maxPreguntas {
			break
		}
		if strings.TrimSpace(chunk.Content) == "" {
			continue
		}

		remaining := maxPreguntas - len(all)

		if s.apiKey == "" {
			fallback := heuristicExtract(chunk.Content, remaining, &chunk.Page)
			for i := range fallback {
				fallback[i].PaginaLibro = &chunk.Page
			}
			all = append(all, fallback...)
			usedFallback = true
			continue
		}

		prompt := buildExtractionPromptForPage(chunk.Content, remaining, chunk.Page)
		pageQuestions, err := s.aiExtractChat(ctx, prompt, chunk.Content)
		if err != nil || len(pageQuestions) == 0 {
			fallback := heuristicExtract(chunk.Content, remaining, &chunk.Page)
			for i := range fallback {
				fallback[i].PaginaLibro = &chunk.Page
			}
			all = append(all, fallback...)
			usedFallback = true
			continue
		}

		for i := range pageQuestions {
			pageQuestions[i].PaginaLibro = &chunk.Page
			pageQuestions[i].Orden = len(all) + i + 1
		}
		all = append(all, pageQuestions...)
	}

	if len(all) == 0 {
		return nil, usedFallback, "", fmt.Errorf("no se pudieron extraer preguntas")
	}

	if len(all) > maxPreguntas {
		all = all[:maxPreguntas]
	}

	if usedFallback {
		return all, true, "extraccion parcial con fallback heuristico", nil
	}

	return all, false, "extraccion IA completada por paginas", nil
}

func (s *AIService) aiExtractChat(ctx context.Context, prompt string, sourceText string) ([]TrabajoPregunta, error) {
	payload := map[string]interface{}{
		"model": s.model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"temperature": 0.1,
		"max_tokens":  1800,
	}
	body, _ := json.Marshal(payload)

	url := "https://router.huggingface.co/v1/chat/completions"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HF chat status %d: %s", resp.StatusCode, string(respBody))
	}

	var chatResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, err
	}
	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("respuesta vacia")
	}

	content := chatResp.Choices[0].Message.Content
	start := strings.Index(content, "[")
	end := strings.LastIndex(content, "]")
	if start == -1 || end == -1 || end <= start {
		return nil, fmt.Errorf("no se encontro JSON")
	}

	var raw []struct {
		Texto       string          `json:"texto"`
		Tipo        string          `json:"tipo"`
		Opciones    json.RawMessage `json:"opciones"`
		PaginaLibro *int            `json:"pagina_libro"`
		ConfianzaIA *float64        `json:"confianza_ia"`
	}
	if err := json.Unmarshal([]byte(content[start:end+1]), &raw); err != nil {
		return nil, err
	}

	out := make([]TrabajoPregunta, 0, len(raw))
	for i, p := range raw {
		tipo := normalizeTipoPregunta(p.Tipo)
		texto := strings.TrimSpace(p.Texto)
		if texto == "" {
			continue
		}
		if !isFaithfulQuestionText(texto, sourceText) {
			continue
		}
		if len(p.Opciones) == 0 {
			p.Opciones = []byte("[]")
		}
		out = append(out, TrabajoPregunta{
			Texto:       texto,
			Tipo:        tipo,
			Opciones:    p.Opciones,
			PaginaLibro: p.PaginaLibro,
			ConfianzaIA: p.ConfianzaIA,
			Orden:       i + 1,
		})
	}

	return out, nil
}

func buildExtractionPrompt(content string, maxPreguntas int) string {
	if len(content) > 12000 {
		content = content[:12000]
	}

	return fmt.Sprintf(`Eres un asistente educativo. A partir del siguiente texto de libro, extrae preguntas evaluables para estudiantes.

Texto:
%s

Devuelve SOLO un arreglo JSON valido con hasta %d items, con esta forma exacta:
[
  {
    "texto": "pregunta",
    "tipo": "opcion_multiple|verdadero_falso|respuesta_corta|completar",
    "opciones": ["A","B","C","D"],
    "pagina_libro": 1,
    "confianza_ia": 0.85
  }
]

Reglas:
- Si no aplica opcion_multiple, devuelve opciones como []
- Extrae SOLO preguntas de ejercicios/evaluacion, no resumas teoria
- Si no hay preguntas de ejercicios claras, devuelve []
- No reformules ni inventes: copia literalmente la pregunta desde el texto fuente
- No incluyas markdown ni comentarios`, content, maxPreguntas)
}

func buildExtractionPromptForPage(content string, maxPreguntas int, page int) string {
	if len(content) > 6000 {
		content = content[:6000]
	}

	return fmt.Sprintf(`Eres un asistente educativo. A partir del siguiente texto de la pagina %d, extrae preguntas evaluables para estudiantes.

Texto de la pagina %d:
%s

Devuelve SOLO un arreglo JSON valido con hasta %d items, con esta forma exacta:
[
  {
    "texto": "pregunta",
    "tipo": "opcion_multiple|verdadero_falso|respuesta_corta|completar",
    "opciones": ["A","B","C","D"],
    "pagina_libro": %d,
    "confianza_ia": 0.85
  }
]

Reglas:
- Si no aplica opcion_multiple, devuelve opciones como []
- Mantener pagina_libro en %d para todas las preguntas
- Extrae SOLO preguntas de ejercicios/evaluacion, no resumas teoria
- Si no hay preguntas de ejercicios claras, devuelve []
- No reformules ni inventes: copia literalmente la pregunta desde el texto fuente
- No incluyas markdown ni comentarios`, page, page, content, maxPreguntas, page, page)
}

func isFaithfulQuestionText(question string, sourceText string) bool {
	q := normalizeForMatch(question)
	s := normalizeForMatch(sourceText)
	if q == "" || s == "" {
		return false
	}

	if strings.Contains(s, q) {
		return true
	}

	// For short questions, allow partial lexical overlap instead of exact containment.
	if len(strings.Fields(q)) <= 5 {
		return tokenOverlapRatio(q, s) >= 0.5
	}

	words := strings.Fields(q)
	if len(words) == 0 {
		return false
	}

	significant := make([]string, 0, len(words))
	for _, w := range words {
		if len(w) >= 4 {
			significant = append(significant, w)
		}
	}

	if len(significant) < 2 {
		return false
	}

	matches := 0
	for _, w := range significant {
		if strings.Contains(s, w) {
			matches++
		}
	}

	ratio := float64(matches) / float64(len(significant))
	return ratio >= 0.6
}

func tokenOverlapRatio(question string, source string) float64 {
	qWords := strings.Fields(question)
	if len(qWords) == 0 {
		return 0
	}

	sourceSet := make(map[string]struct{}, 64)
	for _, w := range strings.Fields(source) {
		if len(w) >= 3 {
			sourceSet[w] = struct{}{}
		}
	}

	if len(sourceSet) == 0 {
		return 0
	}

	matches := 0
	considered := 0
	for _, w := range qWords {
		if len(w) < 3 {
			continue
		}
		considered++
		if _, ok := sourceSet[w]; ok {
			matches++
		}
	}

	if considered == 0 {
		return 0
	}

	return float64(matches) / float64(considered)
}

func normalizeForMatch(text string) string {
	lower := strings.ToLower(text)
	re := regexp.MustCompile(`[^a-z0-9áéíóúñü\s]+`)
	clean := re.ReplaceAllString(lower, " ")
	return strings.Join(strings.Fields(clean), " ")
}

func splitContentByPageMarkers(content string, paginaInicio *int) []pageChunk {
	defaultPage := 1
	if paginaInicio != nil && *paginaInicio > 0 {
		defaultPage = *paginaInicio
	}

	re := regexp.MustCompile(`(?mi)\[\s*PAGINA\s+(\d+)\s*\]`)
	indices := re.FindAllStringSubmatchIndex(content, -1)
	if len(indices) == 0 {
		return []pageChunk{{Page: defaultPage, Content: content}}
	}

	chunks := make([]pageChunk, 0, len(indices))
	for i, idx := range indices {
		pageText := defaultPage + i
		if len(idx) >= 4 {
			if parsed, err := strconv.Atoi(content[idx[2]:idx[3]]); err == nil && parsed > 0 {
				pageText = parsed
			}
		}

		start := idx[1]
		end := len(content)
		if i+1 < len(indices) {
			end = indices[i+1][0]
		}

		block := strings.TrimSpace(content[start:end])
		if block == "" {
			continue
		}
		chunks = append(chunks, pageChunk{Page: pageText, Content: block})
	}

	if len(chunks) == 0 {
		return []pageChunk{{Page: defaultPage, Content: content}}
	}

	return chunks
}

func heuristicExtract(content string, maxPreguntas int, paginaInicio *int) []TrabajoPregunta {
	page := 1
	if paginaInicio != nil && *paginaInicio > 0 {
		page = *paginaInicio
	}

	// First pass: keep list-like items from OCR/book text, even when punctuation is poor.
	lineCandidates := extractQuestionCandidatesFromLines(content)
	if len(lineCandidates) > 0 {
		out := make([]TrabajoPregunta, 0, maxPreguntas)
		for _, c := range lineCandidates {
			if len(out) >= maxPreguntas {
				break
			}
			conf := 0.62
			tipo := "respuesta_corta"
			opciones := json.RawMessage("[]")
			lower := strings.ToLower(c)
			if strings.Contains(lower, "verdadero") || strings.Contains(lower, "falso") {
				tipo = "verdadero_falso"
				opciones = json.RawMessage(`["Verdadero","Falso"]`)
			}
			texto := strings.TrimSpace(c)
			out = append(out, TrabajoPregunta{
				Texto:       texto,
				Tipo:        tipo,
				Opciones:    opciones,
				PaginaLibro: &page,
				ConfianzaIA: &conf,
				Orden:       len(out) + 1,
			})
		}
		if len(out) > 0 {
			return out
		}
	}

	normalized := strings.ReplaceAll(content, "\n", " ")
	normalized = strings.Join(strings.Fields(normalized), " ")
	if normalized == "" {
		return nil
	}

	re := regexp.MustCompile(`[^.!?]+[.!?]`)
	sentences := re.FindAllString(normalized, -1)
	if len(sentences) == 0 {
		sentences = []string{normalized}
	}

	out := make([]TrabajoPregunta, 0, maxPreguntas)
	for _, sentence := range sentences {
		if len(out) >= maxPreguntas {
			break
		}
		s := strings.TrimSpace(sentence)
		if len(s) < 25 {
			continue
		}

		lower := strings.ToLower(s)
		hasQuestionMark := strings.Contains(s, "?") || strings.Contains(s, "¿")
		startsWithInstruction, _ := regexp.MatchString(`^(responde|responda|calcula|complete|completa|selecciona|marca|indica|justifica|define|menciona|enumera|relaciona)\b`, lower)
		startsWithNumber, _ := regexp.MatchString(`^\d{1,2}[\.)]\s+`, s)
		if !hasQuestionMark && !startsWithInstruction && !startsWithNumber {
			continue
		}

		texto := s
		tipo := "respuesta_corta"
		opciones := json.RawMessage("[]")
		conf := 0.55

		if strings.Contains(strings.ToLower(s), "verdadero") || strings.Contains(strings.ToLower(s), "falso") {
			tipo = "verdadero_falso"
			opciones = json.RawMessage(`["Verdadero","Falso"]`)
		}

		out = append(out, TrabajoPregunta{
			Texto:       texto,
			Tipo:        tipo,
			Opciones:    opciones,
			PaginaLibro: &page,
			ConfianzaIA: &conf,
			Orden:       len(out) + 1,
		})
	}

	return out
}

func extractQuestionCandidatesFromLines(content string) []string {
	lines := strings.Split(content, "\n")
	out := make([]string, 0, len(lines))
	seen := make(map[string]struct{}, len(lines))

	for _, line := range lines {
		l := strings.TrimSpace(line)
		if l == "" {
			continue
		}
		lower := strings.ToLower(l)

		hasQuestionMark := strings.Contains(l, "?") || strings.Contains(l, "¿")
		hasNumbering, _ := regexp.MatchString(`(^|\s)(\d{1,2}[\.)]|[a-dA-D][\.)])\s+`, l)
		hasInstruction, _ := regexp.MatchString(`\b(responde|responda|calcula|complete|completa|selecciona|marca|indica|justifica|define|menciona|enumera|relaciona)\b`, lower)

		if !hasQuestionMark && !hasNumbering && !hasInstruction {
			continue
		}

		clean := l
		clean = regexp.MustCompile(`^\s*(\d{1,2}[\.)]|[a-dA-D][\.)])\s*`).ReplaceAllString(clean, "")
		clean = strings.TrimSpace(clean)
		if len(clean) < 10 {
			continue
		}

		if _, exists := seen[clean]; exists {
			continue
		}
		seen[clean] = struct{}{}
		out = append(out, clean)
	}

	return out
}

func normalizeTipoPregunta(in string) string {
	v := strings.ToLower(strings.TrimSpace(in))
	switch v {
	case "opcion_multiple", "multiple_choice", "multiple":
		return "opcion_multiple"
	case "verdadero_falso", "true_false", "vf":
		return "verdadero_falso"
	case "completar", "fill_blank":
		return "completar"
	default:
		return "respuesta_corta"
	}
}
