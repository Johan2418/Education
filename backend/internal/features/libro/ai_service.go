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
	apiKey         string
	model          string
	fallbackModel  string
	enableFallback bool
	baseURL        string
	httpClient     *http.Client
}

type pageChunk struct {
	Page        int
	Content     string
	ImageBase64 *string
}

func NewAIService(cfg config.HuggingFaceConfig) *AIService {
	timeoutSeconds := cfg.TimeoutSeconds
	if timeoutSeconds <= 0 {
		timeoutSeconds = 30
	}

	return &AIService{
		apiKey:         cfg.APIKey,
		model:          cfg.Model,
		fallbackModel:  strings.TrimSpace(cfg.FallbackModel),
		enableFallback: cfg.EnableFallback,
		baseURL: strings.TrimRight(
			cfg.BaseURL,
			"/",
		),
		httpClient: &http.Client{
			Timeout: time.Duration(timeoutSeconds) * time.Second,
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

	imageByPage := normalizeImageMapByPage(req.ImagenesPorPagina)
	chunks := splitContentByPageMarkers(req.Contenido, req.PaginaInicio, imageByPage)
	return s.extractQuestionsByPageChunks(ctx, chunks, maxPreguntas)
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

		if s.shouldUseHeuristicFallback() {
			fallback := heuristicExtract(chunk.Content, remaining, &chunk.Page)
			for i := range fallback {
				enrichQuestionWithVisualContext(&fallback[i], chunk)
			}
			all = append(all, fallback...)
			usedFallback = true
			continue
		}

		prompt := buildExtractionPromptForPage(chunk.Content, remaining, chunk.Page)
		pageCtx := ctx
		cancel := func() {}
		if s.isLocalProvider() {
			// Bound per-page local inference to avoid long-tail latency spikes.
			pageCtx, cancel = context.WithTimeout(ctx, 45*time.Second)
		}
		pageQuestions, err := s.aiExtractChat(pageCtx, prompt, chunk.Content)
		cancel()
		if err != nil || len(pageQuestions) == 0 {
			fallback := heuristicExtract(chunk.Content, remaining, &chunk.Page)
			for i := range fallback {
				enrichQuestionWithVisualContext(&fallback[i], chunk)
			}
			all = append(all, fallback...)
			usedFallback = true
			continue
		}

		for i := range pageQuestions {
			pageQuestions[i].Orden = len(all) + i + 1
			enrichQuestionWithVisualContext(&pageQuestions[i], chunk)
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
	budgets := []localInferenceBudget{{maxTokens: 1800, numCtx: 2048, seed: 0}}
	if s.isLocalProvider() {
		// Keep local runs deterministic and bounded to reduce latency spikes.
		budgets = []localInferenceBudget{
			{maxTokens: 320, numCtx: 1536, seed: 42},
			{maxTokens: 220, numCtx: 1024, seed: 42},
		}
	}

	content, lastErr := s.generateJSONArrayContent(ctx, s.model, prompt, budgets)
	if (strings.TrimSpace(content) == "" || lastErr != nil) && s.shouldUseModelFallback() {
		fallbackBudgets := []localInferenceBudget{
			{maxTokens: 360, numCtx: 1792, seed: 42},
		}
		fallbackContent, fallbackErr := s.generateJSONArrayContent(ctx, s.fallbackModel, prompt, fallbackBudgets)
		if fallbackErr == nil && strings.TrimSpace(fallbackContent) != "" {
			content = fallbackContent
			lastErr = nil
		} else if fallbackErr != nil {
			lastErr = fallbackErr
		}
	}

	if strings.TrimSpace(content) == "" {
		if lastErr != nil {
			return nil, lastErr
		}
		return nil, fmt.Errorf("respuesta vacia")
	}

	start := strings.Index(content, "[")
	end := strings.LastIndex(content, "]")
	if start == -1 || end == -1 || end <= start {
		return nil, fmt.Errorf("no se encontro JSON")
	}

	var raw []struct {
		Texto                 string          `json:"texto"`
		Tipo                  string          `json:"tipo"`
		Opciones              json.RawMessage `json:"opciones"`
		PaginaLibro           *int            `json:"pagina_libro"`
		ConfianzaIA           *float64        `json:"confianza_ia"`
		RespuestaEsperadaTipo *string         `json:"respuesta_esperada_tipo"`
		Placeholder           *string         `json:"placeholder"`
	}
	if err := json.Unmarshal([]byte(content[start:end+1]), &raw); err != nil {
		return nil, err
	}

	out := make([]TrabajoPregunta, 0, len(raw))
	seen := make(map[string]struct{}, len(raw)*2)
	for _, p := range raw {
		baseTipo := normalizeTipoPregunta(p.Tipo)
		parts := splitCompositeQuestionText(p.Texto)
		if len(parts) == 0 {
			continue
		}

		for _, part := range parts {
			texto := strings.TrimSpace(part)
			if texto == "" {
				continue
			}
			if !isFaithfulQuestionText(texto, sourceText) {
				continue
			}

			key := normalizeForMatch(texto)
			if key == "" {
				continue
			}
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}

			tipo := inferQuestionTypeFromText(baseTipo, texto)
			opciones := normalizeOptionsForQuestion(p.Opciones, tipo, texto, len(parts) == 1)
			if tipo == "opcion_multiple" && isEmptyJSONArray(opciones) {
				tipo = "respuesta_corta"
				opciones = []byte("[]")
			}

			out = append(out, TrabajoPregunta{
				Texto:                 texto,
				Tipo:                  tipo,
				Opciones:              opciones,
				PaginaLibro:           p.PaginaLibro,
				ConfianzaIA:           p.ConfianzaIA,
				RespuestaEsperadaTipo: normalizeRespuestaEsperadaTipo(p.RespuestaEsperadaTipo, tipo),
				Placeholder:           trimOrNil(p.Placeholder),
				Orden:                 len(out) + 1,
			})
		}
	}

	return out, nil
}

func splitCompositeQuestionText(input string) []string {
	text := strings.TrimSpace(strings.ReplaceAll(input, "\r\n", "\n"))
	if text == "" {
		return nil
	}

	parts := splitByNumberedMarkers(text)
	if len(parts) <= 1 {
		parts = splitByInlineNumberedMarkers(text)
	}
	if len(parts) <= 1 {
		parts = splitByBlankLines(text)
	}
	if len(parts) <= 1 {
		return []string{text}
	}

	out := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		clean := strings.TrimSpace(numberedPrefixRe.ReplaceAllString(part, ""))
		if len(clean) < 10 {
			continue
		}
		key := normalizeForMatch(clean)
		if key == "" {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, clean)
	}

	if len(out) == 0 {
		return []string{text}
	}
	return out
}

var numberedMarkerRe = regexp.MustCompile(`(?m)(?:^|\n)\s*(?:\d{1,2}[\.)]|[A-Da-d][\.)]|(?:pregunta|ejercicio)\s*\d+[:\.-])\s+`)
var numberedPrefixRe = regexp.MustCompile(`^\s*(?:\d{1,2}[\.)]|[A-Da-d][\.)]|(?:pregunta|ejercicio)\s*\d+[:\.-])\s*`)
var inlineNumberedMarkerRe = regexp.MustCompile(`(?i)(\s+)(\d{1,2}[\.)]|[A-Da-d][\.)]|(?:pregunta|ejercicio)\s*\d+[:\.-])\s+`)
var optionLiteralRe = regexp.MustCompile(`(?m)(?:^|\n)\s*[A-Da-d][\.)]\s*([^\n]+)`)

func splitByNumberedMarkers(text string) []string {
	indices := numberedMarkerRe.FindAllStringIndex(text, -1)
	if len(indices) <= 1 {
		return nil
	}
	out := make([]string, 0, len(indices))
	for i, idx := range indices {
		start := idx[0]
		end := len(text)
		if i+1 < len(indices) {
			end = indices[i+1][0]
		}
		segment := strings.TrimSpace(text[start:end])
		if segment != "" {
			out = append(out, segment)
		}
	}
	return out
}

func splitByBlankLines(text string) []string {
	chunks := strings.Split(text, "\n\n")
	if len(chunks) <= 1 {
		return nil
	}
	out := make([]string, 0, len(chunks))
	for _, chunk := range chunks {
		segment := strings.TrimSpace(chunk)
		if segment != "" {
			out = append(out, segment)
		}
	}
	return out
}

func splitByInlineNumberedMarkers(text string) []string {
	indices := inlineNumberedMarkerRe.FindAllStringSubmatchIndex(text, -1)
	if len(indices) == 0 {
		return nil
	}

	starts := []int{0}
	for _, idx := range indices {
		if len(idx) < 6 {
			continue
		}
		markerStart := idx[4]
		if markerStart > 0 {
			starts = append(starts, markerStart)
		}
	}
	if len(starts) <= 1 {
		return nil
	}

	out := make([]string, 0, len(starts))
	for i, start := range starts {
		end := len(text)
		if i+1 < len(starts) {
			end = starts[i+1]
		}
		segment := strings.TrimSpace(text[start:end])
		if segment != "" {
			out = append(out, segment)
		}
	}
	return out
}

func inferQuestionTypeFromText(baseTipo, texto string) string {
	lower := strings.ToLower(strings.TrimSpace(texto))
	if lower == "" {
		return baseTipo
	}
	if strings.Contains(lower, "verdadero") || strings.Contains(lower, "falso") {
		return "verdadero_falso"
	}
	if optionLiteralRe.MatchString(texto) {
		return "opcion_multiple"
	}
	if strings.Contains(lower, "completa") || strings.Contains(lower, "complete") || strings.Contains(lower, "rellena") {
		return "completar"
	}
	if baseTipo != "" {
		return baseTipo
	}
	return "respuesta_corta"
}

func normalizeOptionsForQuestion(raw json.RawMessage, tipo, texto string, allowRaw bool) json.RawMessage {
	if tipo == "verdadero_falso" {
		return []byte(`["Verdadero","Falso"]`)
	}
	if tipo != "opcion_multiple" {
		return []byte("[]")
	}

	if allowRaw && len(raw) > 0 && !isEmptyJSONArray(raw) {
		return raw
	}

	matches := optionLiteralRe.FindAllStringSubmatch(texto, -1)
	if len(matches) < 2 {
		return []byte("[]")
	}

	opciones := make([]string, 0, len(matches))
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		opt := strings.TrimSpace(m[1])
		if opt == "" {
			continue
		}
		opciones = append(opciones, opt)
	}
	if len(opciones) < 2 {
		return []byte("[]")
	}
	b, err := json.Marshal(opciones)
	if err != nil {
		return []byte("[]")
	}
	return b
}

func isEmptyJSONArray(raw json.RawMessage) bool {
	trimmed := strings.TrimSpace(string(raw))
	return trimmed == "" || trimmed == "[]"
}

func (s *AIService) generateJSONArrayContent(ctx context.Context, model string, prompt string, budgets []localInferenceBudget) (string, error) {
	if strings.TrimSpace(model) == "" {
		return "", fmt.Errorf("modelo no configurado")
	}

	var content string
	var lastErr error
	for i, budget := range budgets {
		currentContent, err := s.requestChatCompletion(ctx, model, prompt, budget)
		if err != nil {
			lastErr = err
			continue
		}

		content = currentContent
		if strings.Index(content, "[") == -1 || strings.LastIndex(content, "]") == -1 {
			lastErr = fmt.Errorf("no se encontro JSON")
			if i < len(budgets)-1 {
				continue
			}
		}
		break
	}

	if strings.TrimSpace(content) == "" {
		if lastErr != nil {
			return "", lastErr
		}
		return "", fmt.Errorf("respuesta vacia")
	}

	return content, lastErr
}

type localInferenceBudget struct {
	maxTokens int
	numCtx    int
	seed      int
}

func (s *AIService) requestChatCompletion(ctx context.Context, model string, prompt string, budget localInferenceBudget) (string, error) {
	payload := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"temperature": 0.1,
		"max_tokens":  budget.maxTokens,
	}

	if s.isLocalProvider() {
		payload["keep_alive"] = "30m"
		payload["options"] = map[string]interface{}{
			"num_ctx":     budget.numCtx,
			"num_predict": budget.maxTokens,
			"seed":        budget.seed,
			"top_p":       0.9,
		}
	}

	body, _ := json.Marshal(payload)
	url := s.baseURL + "/v1/chat/completions"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	if s.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+s.apiKey)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("AI chat status %d: %s", resp.StatusCode, string(respBody))
	}

	var chatResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return "", err
	}
	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("respuesta vacia")
	}

	return chatResp.Choices[0].Message.Content, nil
}

func (s *AIService) shouldUseHeuristicFallback() bool {
	if strings.TrimSpace(s.model) == "" || strings.TrimSpace(s.baseURL) == "" {
		return true
	}

	// Hugging Face Router requires a bearer token; local Ollama does not.
	return s.apiKey == "" && strings.Contains(strings.ToLower(s.baseURL), "huggingface.co")
}

func (s *AIService) isLocalProvider() bool {
	base := strings.ToLower(strings.TrimSpace(s.baseURL))
	return strings.Contains(base, "localhost") || strings.Contains(base, "127.0.0.1") || strings.Contains(base, "ollama")
}

func (s *AIService) shouldUseModelFallback() bool {
	if !s.enableFallback {
		return false
	}
	if !s.isLocalProvider() {
		return false
	}
	if strings.TrimSpace(s.fallbackModel) == "" {
		return false
	}
	return strings.TrimSpace(s.fallbackModel) != strings.TrimSpace(s.model)
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
		"confianza_ia": 0.85,
		"respuesta_esperada_tipo": "abierta|opciones",
		"placeholder": "texto breve opcional"
  }
]

Reglas:
- Si no aplica opcion_multiple, devuelve opciones como []
- Extrae SOLO preguntas de ejercicios/evaluacion, no resumas teoria
- Si no hay preguntas de ejercicios claras, devuelve []
- No reformules ni inventes: copia literalmente la pregunta desde el texto fuente
- Usa respuesta_esperada_tipo="opciones" si la pregunta es de seleccionar opcion; en caso contrario "abierta"
- No incluyas markdown ni comentarios`, content, maxPreguntas)
}

func buildExtractionPromptForPage(content string, maxPreguntas int, page int) string {
	if len(content) > 3200 {
		content = content[:3200]
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
		"confianza_ia": 0.85,
		"respuesta_esperada_tipo": "abierta|opciones",
		"placeholder": "texto breve opcional"
  }
]

Reglas:
- Si no aplica opcion_multiple, devuelve opciones como []
- Mantener pagina_libro en %d para todas las preguntas
- Extrae SOLO preguntas de ejercicios/evaluacion, no resumas teoria
- Si no hay preguntas de ejercicios claras, devuelve []
- No reformules ni inventes: copia literalmente la pregunta desde el texto fuente
- Usa respuesta_esperada_tipo="opciones" si la pregunta es de seleccionar opcion; en caso contrario "abierta"
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

func splitContentByPageMarkers(content string, paginaInicio *int, imageByPage map[int]string) []pageChunk {
	defaultPage := 1
	if paginaInicio != nil && *paginaInicio > 0 {
		defaultPage = *paginaInicio
	}

	re := regexp.MustCompile(`(?mi)\[\s*PAGINA\s+(\d+)\s*\]`)
	indices := re.FindAllStringSubmatchIndex(content, -1)
	if len(indices) == 0 {
		var imageBase64 *string
		if image, ok := imageByPage[defaultPage]; ok && image != "" {
			copyImage := image
			imageBase64 = &copyImage
		}
		return []pageChunk{{Page: defaultPage, Content: content, ImageBase64: imageBase64}}
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
		var imageBase64 *string
		if image, ok := imageByPage[pageText]; ok && image != "" {
			copyImage := image
			imageBase64 = &copyImage
		}
		chunks = append(chunks, pageChunk{Page: pageText, Content: block, ImageBase64: imageBase64})
	}

	if len(chunks) == 0 {
		var imageBase64 *string
		if image, ok := imageByPage[defaultPage]; ok && image != "" {
			copyImage := image
			imageBase64 = &copyImage
		}
		return []pageChunk{{Page: defaultPage, Content: content, ImageBase64: imageBase64}}
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

func normalizeImageMapByPage(raw map[string]string) map[int]string {
	if len(raw) == 0 {
		return nil
	}
	out := make(map[int]string, len(raw))
	for key, value := range raw {
		page, err := strconv.Atoi(strings.TrimSpace(key))
		if err != nil || page <= 0 {
			continue
		}
		image := strings.TrimSpace(value)
		if image == "" {
			continue
		}
		if len(image) > 1_800_000 {
			continue
		}
		out[page] = image
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func normalizeRespuestaEsperadaTipo(input *string, tipoPregunta string) *string {
	if input != nil {
		v := strings.ToLower(strings.TrimSpace(*input))
		if v == "abierta" || v == "opciones" {
			return &v
		}
	}
	if tipoPregunta == "opcion_multiple" || tipoPregunta == "verdadero_falso" {
		v := "opciones"
		return &v
	}
	v := "abierta"
	return &v
}

func trimOrNil(v *string) *string {
	if v == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*v)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func enrichQuestionWithVisualContext(q *TrabajoPregunta, chunk pageChunk) {
	if q == nil {
		return
	}
	q.PaginaLibro = &chunk.Page
	q.RespuestaEsperadaTipo = normalizeRespuestaEsperadaTipo(q.RespuestaEsperadaTipo, q.Tipo)
	if q.Placeholder == nil && q.RespuestaEsperadaTipo != nil && *q.RespuestaEsperadaTipo == "abierta" {
		placeholder := "Escribe tu respuesta"
		q.Placeholder = &placeholder
	}
	if chunk.ImageBase64 != nil && isVisualCueQuestion(q.Texto) {
		source := "pdf_pagina"
		q.ImagenBase64 = chunk.ImageBase64
		q.ImagenFuente = &source
	}
}

func isVisualCueQuestion(text string) bool {
	lower := strings.ToLower(strings.TrimSpace(text))
	if lower == "" {
		return false
	}

	positiveSignals := []string{
		"observa", "ilustracion", "imagen", "grafico", "gráfico", "figura", "diagrama", "esquema", "foto",
		"basandote en la imagen", "basándote en la imagen", "segun la figura", "según la figura", "de acuerdo con la imagen",
	}
	for _, signal := range positiveSignals {
		if strings.Contains(lower, signal) {
			return true
		}
	}

	if regexp.MustCompile(`\b(figura|imagen|grafico|gráfico|diagrama)\s*\d+\b`).MatchString(lower) {
		return true
	}

	negativeSignals := []string{
		"define", "explique", "explica", "mencione", "enumere", "resuma", "concepto", "teoria", "teoría",
	}
	hasNegativeOnly := false
	for _, signal := range negativeSignals {
		if strings.Contains(lower, signal) {
			hasNegativeOnly = true
			break
		}
	}

	if hasNegativeOnly && !regexp.MustCompile(`\b(imagen|figura|grafico|gráfico|diagrama|ilustracion|ilustración)\b`).MatchString(lower) {
		return false
	}

	return false
}
