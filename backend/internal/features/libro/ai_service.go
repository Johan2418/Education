package libro

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/arcanea/backend/internal/config"
)

type AIService struct {
	apiKey                      string
	model                       string
	fallbackModel               string
	enableFallback              bool
	baseURL                     string
	httpClient                  *http.Client
	minQuestionConfidence       float64
	minClosedQuestionConfidence float64
	shortFidelityMin            float64
	longFidelityMin             float64
	minQuestionChars            int
	minQuestionTokens           int
	heuristicSentenceMinChars   int
}

type pageChunk struct {
	Page          int
	Content       string
	ImageBase64   *string
	ImageMetadata *PdfPaginaMetadata
}

const (
	visualCueThreshold   = 0.55
	maxVisualByPageLimit = 2
)

func NewAIService(cfg config.HuggingFaceConfig) *AIService {
	timeoutSeconds := cfg.TimeoutSeconds
	if timeoutSeconds <= 0 {
		timeoutSeconds = 30
	}
	extractCfg := cfg.LibroExtraction
	if extractCfg.MinConfidence <= 0 || extractCfg.MinConfidence > 1 {
		extractCfg.MinConfidence = 0.55
	}
	if extractCfg.MinClosedConfidence <= 0 || extractCfg.MinClosedConfidence > 1 {
		extractCfg.MinClosedConfidence = 0.72
	}
	if extractCfg.ShortFidelityMin <= 0 || extractCfg.ShortFidelityMin > 1 {
		extractCfg.ShortFidelityMin = 0.72
	}
	if extractCfg.LongFidelityMin <= 0 || extractCfg.LongFidelityMin > 1 {
		extractCfg.LongFidelityMin = 0.78
	}
	if extractCfg.MinQuestionChars < 10 {
		extractCfg.MinQuestionChars = 20
	}
	if extractCfg.MinQuestionTokens < 2 {
		extractCfg.MinQuestionTokens = 4
	}
	if extractCfg.HeuristicSentenceMinChars < extractCfg.MinQuestionChars {
		extractCfg.HeuristicSentenceMinChars = extractCfg.MinQuestionChars + 8
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
		minQuestionConfidence:       extractCfg.MinConfidence,
		minClosedQuestionConfidence: extractCfg.MinClosedConfidence,
		shortFidelityMin:            extractCfg.ShortFidelityMin,
		longFidelityMin:             extractCfg.LongFidelityMin,
		minQuestionChars:            extractCfg.MinQuestionChars,
		minQuestionTokens:           extractCfg.MinQuestionTokens,
		heuristicSentenceMinChars:   extractCfg.HeuristicSentenceMinChars,
	}
}

func (s *AIService) ConfiguredModelTag() string {
	if s == nil {
		return ""
	}
	return strings.TrimSpace(s.model)
}

func (s *AIService) FallbackModelTag() string {
	if s == nil {
		return ""
	}
	return strings.TrimSpace(s.fallbackModel)
}

func (s *AIService) minConfidenceThreshold() float64 {
	if s == nil || s.minQuestionConfidence <= 0 || s.minQuestionConfidence > 1 {
		return 0.55
	}
	return s.minQuestionConfidence
}

func (s *AIService) minClosedConfidenceThreshold() float64 {
	if s == nil || s.minClosedQuestionConfidence <= 0 || s.minClosedQuestionConfidence > 1 {
		return 0.72
	}
	return s.minClosedQuestionConfidence
}

func (s *AIService) shortFidelityThreshold() float64 {
	if s == nil || s.shortFidelityMin <= 0 || s.shortFidelityMin > 1 {
		return 0.72
	}
	return s.shortFidelityMin
}

func (s *AIService) longFidelityThreshold() float64 {
	if s == nil || s.longFidelityMin <= 0 || s.longFidelityMin > 1 {
		return 0.78
	}
	return s.longFidelityMin
}

func (s *AIService) minQuestionCharThreshold() int {
	if s == nil || s.minQuestionChars < 10 {
		return 20
	}
	return s.minQuestionChars
}

func (s *AIService) minQuestionTokenThreshold() int {
	if s == nil || s.minQuestionTokens < 2 {
		return 4
	}
	return s.minQuestionTokens
}

func (s *AIService) heuristicSentenceCharThreshold() int {
	if s == nil || s.heuristicSentenceMinChars < s.minQuestionCharThreshold() {
		return s.minQuestionCharThreshold() + 8
	}
	return s.heuristicSentenceMinChars
}

func (s *AIService) ExtractQuestions(ctx context.Context, req ExtractLibroRequest) ([]TrabajoPregunta, bool, string, error) {
	maxPreguntas := 10
	if req.MaxPreguntas != nil && *req.MaxPreguntas > 0 {
		maxPreguntas = *req.MaxPreguntas
		if maxPreguntas > 400 {
			maxPreguntas = 400
		}
	}

	if strings.TrimSpace(req.Contenido) == "" {
		return nil, false, "", fmt.Errorf("contenido es requerido para extraer preguntas")
	}

	imageByPage := normalizeImageMapByPage(req.ImagenesPorPagina)
	metadataByPage := normalizeMetadataMapByPage(req.ImagenesMetadata)
	chunks := splitContentByPageMarkers(req.Contenido, req.PaginaInicio, imageByPage, metadataByPage)
	return s.extractQuestionsByPageChunks(ctx, chunks, maxPreguntas, normalizeModoFormulario(req.ModoFormulario))
}

func (s *AIService) extractQuestionsByPageChunks(ctx context.Context, chunks []pageChunk, maxPreguntas int, modoFormulario string) ([]TrabajoPregunta, bool, string, error) {
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
			fallback := heuristicExtract(
				chunk.Content,
				remaining,
				&chunk.Page,
				s.minQuestionCharThreshold(),
				s.minQuestionTokenThreshold(),
				s.heuristicSentenceCharThreshold(),
			)
			for i := range fallback {
				fallback[i].Tipo, fallback[i].Opciones, fallback[i].RespuestaCorrecta = normalizeQuestionFormByMode(
					fallback[i].Tipo,
					fallback[i].Opciones,
					nil,
					fallback[i].ConfianzaIA,
					modoFormulario,
					s.minClosedConfidenceThreshold(),
				)
				fallback[i].RespuestaEsperadaTipo = normalizeRespuestaEsperadaTipo(fallback[i].RespuestaEsperadaTipo, fallback[i].Tipo)
				enrichQuestionWithVisualContext(&fallback[i], chunk)
				// Ensure pagina_libro is always set from the chunk
				fallback[i].PaginaLibro = &chunk.Page
			}
			if len(fallback) > remaining {
				fallback = fallback[:remaining]
			}
			applyVisualImageCapPerPage(fallback, chunk, maxVisualByPageLimit)
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
		pageQuestions, err := s.aiExtractChat(pageCtx, prompt, chunk.Content, modoFormulario)
		cancel()
		if err != nil || len(pageQuestions) == 0 {
			fallback := heuristicExtract(
				chunk.Content,
				remaining,
				&chunk.Page,
				s.minQuestionCharThreshold(),
				s.minQuestionTokenThreshold(),
				s.heuristicSentenceCharThreshold(),
			)
			for i := range fallback {
				fallback[i].Tipo, fallback[i].Opciones, fallback[i].RespuestaCorrecta = normalizeQuestionFormByMode(
					fallback[i].Tipo,
					fallback[i].Opciones,
					nil,
					fallback[i].ConfianzaIA,
					modoFormulario,
					s.minClosedConfidenceThreshold(),
				)
				fallback[i].RespuestaEsperadaTipo = normalizeRespuestaEsperadaTipo(fallback[i].RespuestaEsperadaTipo, fallback[i].Tipo)
				enrichQuestionWithVisualContext(&fallback[i], chunk)
			}
			if len(fallback) > remaining {
				fallback = fallback[:remaining]
			}
			applyVisualImageCapPerPage(fallback, chunk, maxVisualByPageLimit)
			all = append(all, fallback...)
			usedFallback = true
			continue
		}
		if len(pageQuestions) > remaining {
			pageQuestions = pageQuestions[:remaining]
		}

		for i := range pageQuestions {
			pageQuestions[i].Orden = len(all) + i + 1
			enrichQuestionWithVisualContext(&pageQuestions[i], chunk)
			// Ensure pagina_libro is always set from the chunk
			pageQuestions[i].PaginaLibro = &chunk.Page
		}
		applyVisualImageCapPerPage(pageQuestions, chunk, maxVisualByPageLimit)
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

func (s *AIService) aiExtractChat(ctx context.Context, prompt string, sourceText string, modoFormulario string) ([]TrabajoPregunta, error) {
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

	raw, err := parseModelQuestionsPayload(content[start : end+1])
	if err != nil {
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
			if !s.isLikelyEvaluableQuestionText(texto) {
				continue
			}
			if !s.isFaithfulQuestionText(texto, sourceText) {
				continue
			}
			if !s.passesConfidenceThreshold(p.ConfianzaIA) {
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
			tipo, opciones, respuestaCorrecta := normalizeQuestionFormByMode(
				tipo,
				opciones,
				p.RespuestaCorrecta,
				p.ConfianzaIA,
				modoFormulario,
				s.minClosedConfidenceThreshold(),
			)

			out = append(out, TrabajoPregunta{
				Texto:                 texto,
				Tipo:                  tipo,
				Opciones:              opciones,
				RespuestaCorrecta:     respuestaCorrecta,
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

type modelQuestionPayload struct {
	Texto                 string
	Tipo                  string
	Opciones              json.RawMessage
	RespuestaCorrecta     *string
	PaginaLibro           *int
	ConfianzaIA           *float64
	RespuestaEsperadaTipo *string
	Placeholder           *string
}

func parseModelQuestionsPayload(rawJSON string) ([]modelQuestionPayload, error) {
	clean := sanitizeModelText(rawJSON)
	if clean == "" {
		return nil, fmt.Errorf("json vacio")
	}

	var rawItems []map[string]json.RawMessage
	if err := json.Unmarshal([]byte(clean), &rawItems); err != nil {
		return nil, err
	}

	out := make([]modelQuestionPayload, 0, len(rawItems))
	for _, item := range rawItems {
		texto := sanitizeModelText(extractJSONString(item, "texto"))
		if texto == "" {
			continue
		}

		out = append(out, modelQuestionPayload{
			Texto:                 texto,
			Tipo:                  sanitizeModelText(extractJSONString(item, "tipo")),
			Opciones:              extractJSONRawArray(item, "opciones"),
			RespuestaCorrecta:     extractJSONStringPtr(item, "respuesta_correcta"),
			PaginaLibro:           extractJSONIntPtr(item, "pagina_libro"),
			ConfianzaIA:           extractJSONFloatPtr(item, "confianza_ia"),
			RespuestaEsperadaTipo: extractJSONStringPtr(item, "respuesta_esperada_tipo"),
			Placeholder:           extractJSONStringPtr(item, "placeholder"),
		})
	}

	return out, nil
}

func extractJSONString(item map[string]json.RawMessage, key string) string {
	raw, ok := item[key]
	if !ok || len(raw) == 0 {
		return ""
	}

	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		return strings.TrimSpace(asString)
	}

	var asNumber json.Number
	if err := json.Unmarshal(raw, &asNumber); err == nil {
		return strings.TrimSpace(asNumber.String())
	}

	var asBool bool
	if err := json.Unmarshal(raw, &asBool); err == nil {
		if asBool {
			return "true"
		}
		return "false"
	}

	return strings.TrimSpace(string(raw))
}

func extractJSONStringPtr(item map[string]json.RawMessage, key string) *string {
	value := strings.TrimSpace(sanitizeModelText(extractJSONString(item, key)))
	if value == "" || strings.EqualFold(value, "null") {
		return nil
	}
	return &value
}

func extractJSONIntPtr(item map[string]json.RawMessage, key string) *int {
	raw, ok := item[key]
	if !ok || len(raw) == 0 {
		return nil
	}

	var asInt int
	if err := json.Unmarshal(raw, &asInt); err == nil {
		return &asInt
	}

	var asNumber json.Number
	if err := json.Unmarshal(raw, &asNumber); err == nil {
		if parsed, convErr := strconv.Atoi(strings.TrimSpace(asNumber.String())); convErr == nil {
			return &parsed
		}
	}

	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		if parsed, convErr := strconv.Atoi(strings.TrimSpace(asString)); convErr == nil {
			return &parsed
		}
	}

	return nil
}

func extractJSONFloatPtr(item map[string]json.RawMessage, key string) *float64 {
	raw, ok := item[key]
	if !ok || len(raw) == 0 {
		return nil
	}

	var asFloat float64
	if err := json.Unmarshal(raw, &asFloat); err == nil {
		return &asFloat
	}

	var asNumber json.Number
	if err := json.Unmarshal(raw, &asNumber); err == nil {
		if parsed, convErr := strconv.ParseFloat(strings.TrimSpace(asNumber.String()), 64); convErr == nil {
			return &parsed
		}
	}

	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		if parsed, convErr := strconv.ParseFloat(strings.TrimSpace(asString), 64); convErr == nil {
			return &parsed
		}
	}

	return nil
}

func extractJSONRawArray(item map[string]json.RawMessage, key string) json.RawMessage {
	raw, ok := item[key]
	if !ok || len(raw) == 0 {
		return []byte("[]")
	}
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || strings.EqualFold(trimmed, "null") {
		return []byte("[]")
	}
	if strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]") {
		return json.RawMessage(trimmed)
	}

	// Allow options emitted as a single string "A|B|C|D".
	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		parts := strings.Split(asString, "|")
		opts := make([]string, 0, len(parts))
		for _, part := range parts {
			value := strings.TrimSpace(sanitizeModelText(part))
			if value == "" {
				continue
			}
			opts = append(opts, value)
		}
		if len(opts) == 0 {
			return []byte("[]")
		}
		b, err := json.Marshal(opts)
		if err != nil {
			return []byte("[]")
		}
		return b
	}

	return []byte("[]")
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

var numberedMarkerRe = regexp.MustCompile(`(?mi)(?:^|\n)\s*(?:\d{1,2}[\.)]|[A-Da-d][\.)]|(?:pregunta|ejercicio)\s*\d+[:\.-])\s+`)
var numberedPrefixRe = regexp.MustCompile(`(?mi)^\s*(?:\d{1,2}[\.)]|[A-Da-d][\.)]|(?:pregunta|ejercicio)\s*\d+[:\.-])\s*`)
var inlineNumberedMarkerRe = regexp.MustCompile(`(?i)(\s+)(\d{1,2}[\.)]|[A-Da-d][\.)]|(?:pregunta|ejercicio)\s*\d+[:\.-])\s+`)
var optionLiteralRe = regexp.MustCompile(`(?m)(?:^|\n)\s*[A-Da-d][\.)]\s*([^\n]+)`)
var optionAnswerLetterRe = regexp.MustCompile(`^(?:opcion|opción)?\s*([a-z])$`)
var nonAlnumSpaceRe = regexp.MustCompile(`[^a-z0-9\s]+`)
var questionInstructionStartRe = regexp.MustCompile(`^(responde|responda|calcula|complete|completa|selecciona|marca|indica|justifica|define|menciona|enumera|relaciona|explica|contesta|anota|escribe)\b`)
var questionInstructionAnyRe = regexp.MustCompile(`\b(responde|responda|calcula|complete|completa|selecciona|marca|indica|justifica|define|menciona|enumera|relaciona|explica|contesta|anota|escribe)\b`)
var nonEvaluableHeadingRe = regexp.MustCompile(`\b(?:pelicula|noticia|web|introduccion|resumen|teoria|objetivo|contenido|lectura|glosario|bibliografia|fuente|indice)\b`)
var labelOnlyLineRe = regexp.MustCompile(`^(?:pelicula|noticia|web|fuente|imagen|figura)\s*:?\s*$`)

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

func normalizeModoFormulario(mode *string) string {
	if mode == nil {
		return ModoFormularioMixtoAuto
	}
	value := strings.ToLower(strings.TrimSpace(*mode))
	switch value {
	case ModoFormularioAbierto, ModoFormularioCerradoAuto, ModoFormularioMixtoAuto:
		return value
	default:
		return ModoFormularioMixtoAuto
	}
}

func normalizeQuestionFormByMode(
	tipo string,
	opcionesRaw json.RawMessage,
	respuestaCorrecta *string,
	confianza *float64,
	modoFormulario string,
	minClosedConfidence float64,
) (string, json.RawMessage, *string) {
	mode := normalizeModoFormulario(&modoFormulario)
	if mode == ModoFormularioAbierto {
		return "respuesta_corta", []byte("[]"), nil
	}

	if !closedQuestionConfidencePass(confianza, minClosedConfidence) {
		return "respuesta_corta", []byte("[]"), nil
	}

	switch tipo {
	case "verdadero_falso":
		options := []string{"Verdadero", "Falso"}
		correct := normalizeTrueFalseAnswer(respuestaCorrecta)
		if correct == nil {
			return "respuesta_corta", []byte("[]"), nil
		}
		optionsJSON, _ := json.Marshal(options)
		return "verdadero_falso", optionsJSON, correct
	case "opcion_multiple":
		options := normalizeOptionValuesFromRaw(opcionesRaw)
		if len(options) < 2 {
			return "respuesta_corta", []byte("[]"), nil
		}
		correct := normalizeMultipleChoiceAnswer(respuestaCorrecta, options)
		if correct == nil {
			return "respuesta_corta", []byte("[]"), nil
		}
		optionsJSON, _ := json.Marshal(options)
		return "opcion_multiple", optionsJSON, correct
	default:
		return tipo, []byte("[]"), nil
	}
}

func closedQuestionConfidencePass(confianza *float64, minClosedConfidence float64) bool {
	if confianza == nil {
		return true
	}
	threshold := clampFloat(minClosedConfidence, 0.01, 1)
	return clampFloat(*confianza, 0, 1) >= threshold
}

func normalizeOptionValuesFromRaw(raw json.RawMessage) []string {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "[]" || strings.EqualFold(trimmed, "null") {
		return nil
	}

	var asStrings []string
	if err := json.Unmarshal(raw, &asStrings); err == nil {
		return dedupeTrimmedOptions(asStrings)
	}

	var asAny []interface{}
	if err := json.Unmarshal(raw, &asAny); err != nil {
		return nil
	}

	values := make([]string, 0, len(asAny))
	for _, item := range asAny {
		switch v := item.(type) {
		case string:
			values = append(values, v)
		case map[string]interface{}:
			if text, ok := v["texto"].(string); ok {
				values = append(values, text)
			}
		}
	}
	return dedupeTrimmedOptions(values)
}

func dedupeTrimmedOptions(values []string) []string {
	out := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(sanitizeModelText(value))
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}

func normalizeTrueFalseAnswer(raw *string) *string {
	if raw == nil {
		return nil
	}
	value := strings.ToLower(strings.TrimSpace(sanitizeModelText(*raw)))
	switch value {
	case "verdadero", "v", "true", "cierto":
		normalized := "Verdadero"
		return &normalized
	case "falso", "f", "false":
		normalized := "Falso"
		return &normalized
	default:
		return nil
	}
}

func normalizeMultipleChoiceAnswer(raw *string, options []string) *string {
	if raw == nil || len(options) == 0 {
		return nil
	}
	trimmed := strings.TrimSpace(sanitizeModelText(*raw))
	if trimmed == "" {
		return nil
	}

	for _, option := range options {
		if strings.EqualFold(trimmed, option) {
			answer := option
			return &answer
		}
	}

	lower := strings.ToLower(trimmed)
	if len(lower) == 1 && lower[0] >= 'a' && lower[0] <= 'z' {
		idx := int(lower[0] - 'a')
		if idx >= 0 && idx < len(options) {
			answer := options[idx]
			return &answer
		}
	}

	if matches := optionAnswerLetterRe.FindStringSubmatch(lower); len(matches) == 2 {
		letter := matches[1]
		if len(letter) == 1 && letter[0] >= 'a' && letter[0] <= 'z' {
			idx := int(letter[0] - 'a')
			if idx >= 0 && idx < len(options) {
				answer := options[idx]
				return &answer
			}
		}
	}

	if idx, err := strconv.Atoi(strings.TrimSpace(lower)); err == nil {
		idx = idx - 1
		if idx >= 0 && idx < len(options) {
			answer := options[idx]
			return &answer
		}
	}

	return nil
}

func normalizeOptionsForQuestion(raw json.RawMessage, tipo, texto string, allowRaw bool) json.RawMessage {
	if tipo == "verdadero_falso" {
		return []byte(`["Verdadero","Falso"]`)
	}
	if tipo != "opcion_multiple" {
		return []byte("[]")
	}

	if allowRaw && len(raw) > 0 && !isEmptyJSONArray(raw) {
		opts := normalizeOptionValuesFromRaw(raw)
		if len(opts) >= 2 {
			b, err := json.Marshal(opts)
			if err == nil {
				return b
			}
		}
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

	return sanitizeModelText(chatResp.Choices[0].Message.Content), nil
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

func (s *AIService) GenerateChatAnswer(ctx context.Context, messages []map[string]string) (string, bool, string, error) {
	if len(messages) == 0 {
		return "", false, "", fmt.Errorf("mensajes requeridos")
	}

	if strings.TrimSpace(s.model) == "" {
		return "", true, "", fmt.Errorf("modelo no configurado")
	}

	budgets := []localInferenceBudget{{maxTokens: 420, numCtx: 2048, seed: 42}}
	if s.isLocalProvider() {
		budgets = []localInferenceBudget{
			{maxTokens: 420, numCtx: 3072, seed: 42},
			{maxTokens: 320, numCtx: 2048, seed: 42},
		}
	}

	answer, err := s.requestChatCompletionWithMessages(ctx, s.model, messages, budgets)
	if err == nil && strings.TrimSpace(answer) != "" {
		model := strings.TrimSpace(s.model)
		return answer, false, model, nil
	}

	if s.shouldUseModelFallback() {
		fallbackBudgets := []localInferenceBudget{{maxTokens: 360, numCtx: 2048, seed: 42}}
		fallbackAnswer, fallbackErr := s.requestChatCompletionWithMessages(ctx, s.fallbackModel, messages, fallbackBudgets)
		if fallbackErr == nil && strings.TrimSpace(fallbackAnswer) != "" {
			model := strings.TrimSpace(s.fallbackModel)
			return fallbackAnswer, true, model, nil
		}
		if fallbackErr != nil {
			return "", true, "", fallbackErr
		}
	}

	if err != nil {
		return "", true, "", err
	}
	return "", true, "", fmt.Errorf("respuesta vacia")
}

func (s *AIService) requestChatCompletionWithMessages(ctx context.Context, model string, messages []map[string]string, budgets []localInferenceBudget) (string, error) {
	if strings.TrimSpace(model) == "" {
		return "", fmt.Errorf("modelo no configurado")
	}

	var lastErr error
	for _, budget := range budgets {
		payload := map[string]interface{}{
			"model":       model,
			"messages":    messages,
			"temperature": 0.2,
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
			lastErr = err
			continue
		}
		if s.apiKey != "" {
			req.Header.Set("Authorization", "Bearer "+s.apiKey)
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := s.httpClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("AI chat status %d: %s", resp.StatusCode, string(respBody))
			continue
		}

		var chatResp struct {
			Choices []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		}

		if err := json.Unmarshal(respBody, &chatResp); err != nil {
			lastErr = err
			continue
		}
		if len(chatResp.Choices) == 0 {
			lastErr = fmt.Errorf("respuesta vacia")
			continue
		}

		content := sanitizeModelText(chatResp.Choices[0].Message.Content)
		if content == "" {
			lastErr = fmt.Errorf("respuesta vacia")
			continue
		}
		return content, nil
	}

	if lastErr != nil {
		return "", lastErr
	}
	return "", fmt.Errorf("respuesta vacia")
}

func buildExtractionPrompt(content string, maxPreguntas int) string {
	content = truncateAtWordBoundary(content, 12000)

	return fmt.Sprintf(`Eres un asistente educativo. A partir del siguiente texto de libro, extrae preguntas evaluables para estudiantes.

Texto:
%s

Devuelve SOLO un arreglo JSON valido con hasta %d items, con esta forma exacta:
[
  {
    "texto": "pregunta",
    "tipo": "opcion_multiple|verdadero_falso|respuesta_corta|completar",
    "opciones": ["A","B","C","D"],
    "respuesta_correcta": "texto exacto de la opcion correcta o Verdadero/Falso",
    "pagina_libro": 1,
		"confianza_ia": 0.85,
		"respuesta_esperada_tipo": "abierta|opciones",
		"placeholder": "texto breve opcional"
  }
]

Reglas:
- Si no aplica opcion_multiple, devuelve opciones como []
- Si "tipo" es opcion_multiple o verdadero_falso, debes incluir "respuesta_correcta"
- Extrae SOLO preguntas de ejercicios/evaluacion, no resumas teoria
- Si no hay preguntas de ejercicios claras, devuelve []
- No reformules ni inventes: copia literalmente la pregunta desde el texto fuente
- Usa solamente estos valores exactos para "tipo": opcion_multiple, verdadero_falso, respuesta_corta, completar
- Nunca uses tipos alternos como "definicion", "escritura", "abierta" o "pregunta_abierta"
- Usa respuesta_esperada_tipo="opciones" si la pregunta es de seleccionar opcion; en caso contrario "abierta"
- Mantén texto UTF-8 legible (sin caracteres corruptos como Ã¡, Ã±, Â¿)
- No incluyas markdown ni comentarios`, content, maxPreguntas)
}

func buildExtractionPromptForPage(content string, maxPreguntas int, page int) string {
	content = truncateAtWordBoundary(content, 3200)

	return fmt.Sprintf(`Eres un asistente educativo. A partir del siguiente texto de la pagina %d, extrae preguntas evaluables para estudiantes.

Texto de la pagina %d:
%s

Devuelve SOLO un arreglo JSON valido con hasta %d items, con esta forma exacta:
[
  {
    "texto": "pregunta",
    "tipo": "opcion_multiple|verdadero_falso|respuesta_corta|completar",
    "opciones": ["A","B","C","D"],
    "respuesta_correcta": "texto exacto de la opcion correcta o Verdadero/Falso",
    "pagina_libro": %d,
		"confianza_ia": 0.85,
		"respuesta_esperada_tipo": "abierta|opciones",
		"placeholder": "texto breve opcional"
  }
]

Reglas:
- Si no aplica opcion_multiple, devuelve opciones como []
- Si "tipo" es opcion_multiple o verdadero_falso, debes incluir "respuesta_correcta"
- Mantener pagina_libro en %d para todas las preguntas
- Extrae SOLO preguntas de ejercicios/evaluacion, no resumas teoria
- Si no hay preguntas de ejercicios claras, devuelve []
- No reformules ni inventes: copia literalmente la pregunta desde el texto fuente
- Usa solamente estos valores exactos para "tipo": opcion_multiple, verdadero_falso, respuesta_corta, completar
- Nunca uses tipos alternos como "definicion", "escritura", "abierta" o "pregunta_abierta"
- Usa respuesta_esperada_tipo="opciones" si la pregunta es de seleccionar opcion; en caso contrario "abierta"
- Mantén texto UTF-8 legible (sin caracteres corruptos como Ã¡, Ã±, Â¿)
- No incluyas markdown ni comentarios`, page, page, content, maxPreguntas, page, page)
}

func (s *AIService) passesConfidenceThreshold(confidence *float64) bool {
	if confidence == nil {
		return true
	}
	return clampFloat(*confidence, 0, 1) >= s.minConfidenceThreshold()
}

func (s *AIService) isLikelyEvaluableQuestionText(question string) bool {
	trimmed := strings.TrimSpace(question)
	if trimmed == "" {
		return false
	}
	if utf8.RuneCountInString(trimmed) < s.minQuestionCharThreshold() {
		return false
	}

	normalized := normalizeForMatch(trimmed)
	if normalized == "" {
		return false
	}
	if len(strings.Fields(normalized)) < s.minQuestionTokenThreshold() {
		return false
	}

	normalizedDirect := normalizeSpanishText(trimmed)
	if labelOnlyLineRe.MatchString(normalizedDirect) {
		return false
	}

	hasQuestionMark := strings.Contains(trimmed, "?") || strings.Contains(trimmed, "\u00bf")
	hasNumberPrefix := numberedPrefixRe.MatchString(trimmed)
	hasInstruction := questionInstructionStartRe.MatchString(normalized) || questionInstructionAnyRe.MatchString(normalized)
	if !hasQuestionMark && !hasNumberPrefix && !hasInstruction {
		return false
	}

	if strings.HasSuffix(trimmed, ":") && !hasQuestionMark {
		return false
	}

	if nonEvaluableHeadingRe.MatchString(normalized) && !hasQuestionMark && !hasInstruction {
		return false
	}

	return true
}

func (s *AIService) isFaithfulQuestionText(question string, sourceText string) bool {
	q := normalizeForMatch(question)
	sourceNorm := normalizeForMatch(sourceText)
	if q == "" || sourceNorm == "" {
		return false
	}

	if strings.Contains(sourceNorm, q) {
		return true
	}

	// For short questions, allow partial lexical overlap instead of exact containment.
	if len(strings.Fields(q)) <= 5 {
		return tokenOverlapRatio(q, sourceNorm) >= s.shortFidelityThreshold()
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
		if strings.Contains(sourceNorm, w) {
			matches++
		}
	}

	ratio := float64(matches) / float64(len(significant))
	return ratio >= s.longFidelityThreshold()
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
	normalized := normalizeSpanishText(text)
	if normalized == "" {
		return ""
	}
	clean := nonAlnumSpaceRe.ReplaceAllString(normalized, " ")
	return strings.Join(strings.Fields(clean), " ")
}

func normalizeSpanishText(text string) string {
	fixed := sanitizeModelText(text)
	if fixed == "" {
		return ""
	}
	lower := strings.ToLower(strings.TrimSpace(fixed))
	if lower == "" {
		return ""
	}
	replacer := strings.NewReplacer(
		"á", "a",
		"é", "e",
		"í", "i",
		"ó", "o",
		"ú", "u",
		"ü", "u",
		"ñ", "n",
		"ç", "c",
		"ä", "a",
		"ë", "e",
		"ï", "i",
		"ö", "o",
	)
	return replacer.Replace(lower)
}

func sanitizeModelText(raw string) string {
	text := strings.TrimSpace(raw)
	if text == "" {
		return ""
	}
	text = strings.ToValidUTF8(text, "")
	text = repairCommonMojibake(text)
	return strings.TrimSpace(text)
}

func repairCommonMojibake(text string) string {
	if text == "" {
		return ""
	}

	out := text
	for i := 0; i < 2; i++ {
		decoded, ok := decodeLatin1AsUTF8(out)
		if !ok || decoded == out {
			break
		}
		out = decoded
	}

	out = strings.NewReplacer(
		"â€œ", "\"",
		"â€", "\"",
		"â€˜", "'",
		"â€™", "'",
		"â€“", "-",
		"â€”", "-",
		"Â¿", "¿",
		"Â¡", "¡",
		"Â ", " ",
		"\u00a0", " ",
	).Replace(out)
	return out
}

func decodeLatin1AsUTF8(value string) (string, bool) {
	if value == "" {
		return "", false
	}

	buffer := make([]byte, 0, len(value))
	for _, r := range value {
		if r > 0xFF {
			return value, false
		}
		buffer = append(buffer, byte(r))
	}
	if !utf8.Valid(buffer) {
		return value, false
	}

	decoded := string(buffer)
	if decoded == value {
		return value, false
	}
	return decoded, true
}

func splitContentByPageMarkers(content string, paginaInicio *int, imageByPage map[int]string, metadataByPage map[int]PdfPaginaMetadata) []pageChunk {
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
		var imageMetadata *PdfPaginaMetadata
		if metadata, ok := metadataByPage[defaultPage]; ok {
			copyMetadata := metadata
			imageMetadata = &copyMetadata
		}
		return []pageChunk{{Page: defaultPage, Content: content, ImageBase64: imageBase64, ImageMetadata: imageMetadata}}
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
		var imageMetadata *PdfPaginaMetadata
		if metadata, ok := metadataByPage[pageText]; ok {
			copyMetadata := metadata
			imageMetadata = &copyMetadata
		}
		chunks = append(chunks, pageChunk{Page: pageText, Content: block, ImageBase64: imageBase64, ImageMetadata: imageMetadata})
	}

	if len(chunks) == 0 {
		var imageBase64 *string
		if image, ok := imageByPage[defaultPage]; ok && image != "" {
			copyImage := image
			imageBase64 = &copyImage
		}
		var imageMetadata *PdfPaginaMetadata
		if metadata, ok := metadataByPage[defaultPage]; ok {
			copyMetadata := metadata
			imageMetadata = &copyMetadata
		}
		return []pageChunk{{Page: defaultPage, Content: content, ImageBase64: imageBase64, ImageMetadata: imageMetadata}}
	}

	return chunks
}

func heuristicExtract(
	content string,
	maxPreguntas int,
	paginaInicio *int,
	minQuestionChars int,
	minQuestionTokens int,
	heuristicSentenceMinChars int,
) []TrabajoPregunta {
	page := 1
	if paginaInicio != nil && *paginaInicio > 0 {
		page = *paginaInicio
	}
	if minQuestionChars < 10 {
		minQuestionChars = 20
	}
	if minQuestionTokens < 2 {
		minQuestionTokens = 4
	}
	if heuristicSentenceMinChars < minQuestionChars {
		heuristicSentenceMinChars = minQuestionChars + 8
	}

	// First pass: keep list-like items from OCR/book text, even when punctuation is poor.
	lineCandidates := extractQuestionCandidatesFromLines(content, minQuestionChars, minQuestionTokens)
	inlineCandidates := extractQuestionCandidatesFromInlineMarkers(content, minQuestionChars, minQuestionTokens)
	candidates := mergeQuestionCandidates(lineCandidates, inlineCandidates)
	if len(candidates) > 0 {
		out := make([]TrabajoPregunta, 0, maxPreguntas)
		for _, c := range candidates {
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
		if utf8.RuneCountInString(s) < heuristicSentenceMinChars {
			continue
		}

		lower := strings.ToLower(s)
		hasQuestionMark := strings.Contains(s, "?") || strings.Contains(s, "\u00bf")
		startsWithInstruction := questionInstructionStartRe.MatchString(lower)
		startsWithNumber := numberedPrefixRe.MatchString(s)
		if !hasQuestionMark && !startsWithInstruction && !startsWithNumber {
			continue
		}
		if nonEvaluableHeadingRe.MatchString(normalizeForMatch(s)) && !hasQuestionMark && !startsWithInstruction {
			continue
		}
		if len(strings.Fields(normalizeForMatch(s))) < minQuestionTokens {
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

func mergeQuestionCandidates(primary []string, secondary []string) []string {
	if len(primary) == 0 {
		return secondary
	}
	if len(secondary) == 0 {
		return primary
	}

	out := make([]string, 0, len(primary)+len(secondary))
	seen := make(map[string]struct{}, len(primary)+len(secondary))
	appendUnique := func(items []string) {
		for _, item := range items {
			key := normalizeForMatch(item)
			if key == "" {
				continue
			}
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			out = append(out, item)
		}
	}

	appendUnique(primary)
	appendUnique(secondary)
	return out
}

func isValidHeuristicCandidate(
	clean string,
	minQuestionChars int,
	minQuestionTokens int,
	fromNumberedMarker bool,
) bool {
	if clean == "" {
		return false
	}
	normalizedClean := normalizeSpanishText(clean)
	if labelOnlyLineRe.MatchString(normalizedClean) {
		return false
	}
	if utf8.RuneCountInString(clean) < minQuestionChars {
		return false
	}

	normalized := normalizeForMatch(clean)
	if normalized == "" {
		return false
	}
	if len(strings.Fields(normalized)) < minQuestionTokens {
		return false
	}

	hasQuestionMark := strings.Contains(clean, "?") || strings.Contains(clean, "\u00bf")
	hasInstruction := questionInstructionAnyRe.MatchString(strings.ToLower(clean))
	hasOptions := optionLiteralRe.MatchString(clean)
	if !hasQuestionMark && !hasInstruction && !hasOptions && !fromNumberedMarker {
		return false
	}
	if strings.HasSuffix(clean, ":") && !hasQuestionMark {
		return false
	}
	if nonEvaluableHeadingRe.MatchString(normalized) && !hasQuestionMark && !hasInstruction {
		return false
	}
	return true
}

func extractQuestionCandidatesFromLines(content string, minQuestionChars int, minQuestionTokens int) []string {
	lines := strings.Split(content, "\n")
	out := make([]string, 0, len(lines))
	seen := make(map[string]struct{}, len(lines))

	for _, line := range lines {
		l := strings.TrimSpace(line)
		if l == "" {
			continue
		}
		lower := strings.ToLower(l)

		hasQuestionMark := strings.Contains(l, "?") || strings.Contains(l, "\u00bf")
		hasNumbering := numberedPrefixRe.MatchString(l)
		hasInstruction := questionInstructionAnyRe.MatchString(lower)

		if !hasQuestionMark && !hasNumbering && !hasInstruction {
			continue
		}

		clean := l
		clean = numberedPrefixRe.ReplaceAllString(clean, "")
		clean = strings.TrimSpace(clean)
		if !isValidHeuristicCandidate(clean, minQuestionChars, minQuestionTokens, hasNumbering) {
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

func extractQuestionCandidatesFromInlineMarkers(content string, minQuestionChars int, minQuestionTokens int) []string {
	normalizedContent := strings.ReplaceAll(content, "\r\n", "\n")
	normalizedContent = strings.ReplaceAll(normalizedContent, "\r", "\n")
	normalizedContent = strings.Join(strings.Fields(normalizedContent), " ")
	if normalizedContent == "" {
		return nil
	}

	segments := splitByNumberedMarkers(normalizedContent)
	if len(segments) <= 1 {
		segments = splitByInlineNumberedMarkers(normalizedContent)
	}
	if len(segments) == 0 {
		return nil
	}

	out := make([]string, 0, len(segments))
	seen := make(map[string]struct{}, len(segments))
	for _, segment := range segments {
		clean := strings.TrimSpace(numberedPrefixRe.ReplaceAllString(segment, ""))
		clean = strings.Join(strings.Fields(clean), " ")
		if !isValidHeuristicCandidate(clean, minQuestionChars, minQuestionTokens, true) {
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

	return out
}

func normalizeTipoPregunta(in string) string {
	v := normalizeSpanishText(in)
	v = strings.ReplaceAll(v, "-", "_")
	v = strings.ReplaceAll(v, " ", "_")
	switch v {
	case "opcion_multiple", "multiple_choice", "multiple":
		return "opcion_multiple"
	case "verdadero_falso", "true_false", "vf":
		return "verdadero_falso"
	case "completar", "fill_blank", "llenar_espacios":
		return "completar"
	case "definicion", "escritura", "abierta", "pregunta_abierta", "texto", "respuesta_larga":
		return "respuesta_corta"
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

func normalizeMetadataMapByPage(raw map[string]PdfPaginaMetadata) map[int]PdfPaginaMetadata {
	if len(raw) == 0 {
		return nil
	}

	out := make(map[int]PdfPaginaMetadata, len(raw))
	for key, value := range raw {
		page, err := strconv.Atoi(strings.TrimSpace(key))
		if err != nil || page <= 0 {
			continue
		}
		if value.ImageWidth <= 0 || value.ImageHeight <= 0 {
			continue
		}

		regions := make([]PdfTextoRegion, 0, len(value.TextRegions))
		for _, region := range value.TextRegions {
			text := strings.TrimSpace(region.Texto)
			if text == "" {
				continue
			}
			if region.Width <= 1 || region.Height <= 1 {
				continue
			}

			x := clampFloat(region.X, 0, float64(value.ImageWidth-1))
			y := clampFloat(region.Y, 0, float64(value.ImageHeight-1))
			width := clampFloat(region.Width, 1, float64(value.ImageWidth))
			height := clampFloat(region.Height, 1, float64(value.ImageHeight))

			regions = append(regions, PdfTextoRegion{
				Texto:  text,
				X:      x,
				Y:      y,
				Width:  width,
				Height: height,
			})
		}

		if len(regions) == 0 {
			continue
		}

		out[page] = PdfPaginaMetadata{
			ImageWidth:  value.ImageWidth,
			ImageHeight: value.ImageHeight,
			TextRegions: regions,
		}
	}

	if len(out) == 0 {
		return nil
	}
	return out
}

func clampFloat(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
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
	if chunk.ImageBase64 != nil && calculateVisualCueScore(q.Texto, chunk.Content) >= visualCueThreshold {
		cropped, source := cropQuestionImageSection(q.Texto, chunk)
		if cropped != nil {
			q.ImagenBase64 = cropped
			q.ImagenFuente = source
		}
	}
}

func cropQuestionImageSection(question string, chunk pageChunk) (*string, *string) {
	if chunk.ImageBase64 == nil || chunk.ImageMetadata == nil || len(chunk.ImageMetadata.TextRegions) == 0 {
		return nil, nil
	}

	qNorm := normalizeForMatch(question)
	qTokens := textTokensForMatch(qNorm)
	if len(qTokens) == 0 {
		return nil, nil
	}

	type regionMatch struct {
		region  PdfTextoRegion
		score   float64
		matches int
	}

	matches := make([]regionMatch, 0, len(chunk.ImageMetadata.TextRegions))
	bestScore := 0.0
	bestIndex := -1
	for _, region := range chunk.ImageMetadata.TextRegions {
		rNorm := normalizeForMatch(region.Texto)
		if rNorm == "" {
			continue
		}

		score, hits := regionTextMatchScore(qNorm, qTokens, rNorm)
		if hits == 0 || score < 0.34 {
			continue
		}

		if hits < 2 && !(len(qTokens) <= 4 && score >= 0.5) {
			continue
		}

		matches = append(matches, regionMatch{region: region, score: score, matches: hits})
		if score > bestScore {
			bestScore = score
			bestIndex = len(matches) - 1
		}
	}

	if len(matches) == 0 || bestIndex < 0 || bestScore < 0.5 {
		return nil, nil
	}

	best := matches[bestIndex].region
	bestCenterY := best.Y + (best.Height / 2)

	minX := best.X
	minY := best.Y
	maxX := best.X + best.Width
	maxY := best.Y + best.Height

	for _, m := range matches {
		centerY := m.region.Y + (m.region.Height / 2)
		if absFloat(centerY-bestCenterY) > 140 && m.score < bestScore*0.8 {
			continue
		}

		if m.region.X < minX {
			minX = m.region.X
		}
		if m.region.Y < minY {
			minY = m.region.Y
		}
		right := m.region.X + m.region.Width
		bottom := m.region.Y + m.region.Height
		if right > maxX {
			maxX = right
		}
		if bottom > maxY {
			maxY = bottom
		}
	}

	decoded, format, err := decodeDataURLImage(*chunk.ImageBase64)
	if err != nil || decoded == nil {
		return nil, nil
	}

	bounds := decoded.Bounds()
	if bounds.Dx() <= 0 || bounds.Dy() <= 0 {
		return nil, nil
	}

	paddingX := (maxX - minX) * 0.18
	paddingY := (maxY - minY) * 0.18

	left := int(clampFloat(minX-paddingX, 0, float64(bounds.Dx()-1)))
	top := int(clampFloat(minY-paddingY, 0, float64(bounds.Dy()-1)))
	right := int(clampFloat(maxX+paddingX, float64(left+1), float64(bounds.Dx())))
	bottom := int(clampFloat(maxY+paddingY, float64(top+1), float64(bounds.Dy())))

	if right-left < 24 || bottom-top < 24 {
		return nil, nil
	}

	cropRect := image.Rect(left, top, right, bottom)
	canvas := image.NewRGBA(image.Rect(0, 0, cropRect.Dx(), cropRect.Dy()))
	draw.Draw(canvas, canvas.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	draw.Draw(canvas, canvas.Bounds(), decoded, cropRect.Min, draw.Over)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, canvas, &jpeg.Options{Quality: 78}); err != nil {
		return nil, nil
	}

	encoded := "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
	source := "pdf_pregunta_crop"
	if strings.EqualFold(format, "png") {
		source = "pdf_pregunta_crop_png"
	}

	return &encoded, &source
}

func decodeDataURLImage(dataURL string) (image.Image, string, error) {
	trimmed := strings.TrimSpace(dataURL)
	if trimmed == "" {
		return nil, "", fmt.Errorf("data url vacia")
	}

	parts := strings.SplitN(trimmed, ",", 2)
	if len(parts) != 2 {
		return nil, "", fmt.Errorf("data url invalida")
	}

	payload := parts[1]
	raw, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return nil, "", err
	}

	img, format, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, "", err
	}
	return img, format, nil
}

func textTokensForMatch(normalized string) []string {
	if normalized == "" {
		return nil
	}
	words := strings.Fields(normalized)
	out := make([]string, 0, len(words))
	for _, w := range words {
		if len(w) >= 3 {
			out = append(out, w)
		}
	}
	return out
}

func regionTextMatchScore(questionNorm string, questionTokens []string, regionNorm string) (float64, int) {
	if regionNorm == "" || len(questionTokens) == 0 {
		return 0, 0
	}

	matchCount := 0
	for _, token := range questionTokens {
		if strings.Contains(regionNorm, token) {
			matchCount++
		}
	}

	if matchCount == 0 {
		return 0, 0
	}

	score := float64(matchCount) / float64(len(questionTokens))
	if strings.Contains(regionNorm, questionNorm) {
		score += 0.25
	} else if strings.Contains(questionNorm, regionNorm) && len(regionNorm) > 14 {
		score += 0.12
	}

	if score > 1 {
		score = 1
	}

	return score, matchCount
}

func absFloat(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

func applyVisualImageCapPerPage(questions []TrabajoPregunta, chunk pageChunk, maxWithImage int) {
	if maxWithImage <= 0 || len(questions) == 0 {
		return
	}

	type visualCandidate struct {
		index int
		score float64
	}

	candidates := make([]visualCandidate, 0, len(questions))
	for i := range questions {
		if questions[i].ImagenBase64 == nil {
			continue
		}
		score := calculateVisualCueScore(questions[i].Texto, chunk.Content)
		candidates = append(candidates, visualCandidate{index: i, score: score})
	}

	if len(candidates) <= maxWithImage {
		return
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].score == candidates[j].score {
			return candidates[i].index < candidates[j].index
		}
		return candidates[i].score > candidates[j].score
	})

	keep := make(map[int]struct{}, maxWithImage)
	for i := 0; i < maxWithImage; i++ {
		keep[candidates[i].index] = struct{}{}
	}

	for _, candidate := range candidates {
		if _, ok := keep[candidate.index]; ok {
			continue
		}
		questions[candidate.index].ImagenBase64 = nil
		questions[candidate.index].ImagenFuente = nil
	}
}

func truncateAtWordBoundary(content string, maxLen int) string {
	if maxLen <= 0 || len(content) <= maxLen {
		return content
	}

	trimmed := content[:maxLen]
	if idx := strings.LastIndex(trimmed, " "); idx > maxLen/2 {
		return strings.TrimSpace(trimmed[:idx])
	}

	return strings.TrimSpace(trimmed)
}

func calculateVisualCueScore(text string, pageContent string) float64 {
	lower := normalizeSpanishText(text)
	if lower == "" {
		return 0
	}

	pageLower := normalizeSpanishText(pageContent)
	score := 0.0

	positiveSignals := map[string]float64{
		"observa":                  0.30,
		"ilustracion":              0.35,
		"imagen":                   0.30,
		"grafico":                  0.30,
		"figura":                   0.30,
		"diagrama":                 0.35,
		"esquema":                  0.30,
		"foto":                     0.25,
		"basandote en la imagen":   0.45,
		"segun la figura":          0.40,
		"de acuerdo con la imagen": 0.40,
	}
	for signal, weight := range positiveSignals {
		if strings.Contains(lower, signal) {
			score += weight
		}
	}

	visualRefRe := regexp.MustCompile(`\b(figura|imagen|grafico|diagrama)\s*\d+\b`)
	refs := visualRefRe.FindAllString(lower, -1)
	if len(refs) > 0 {
		score += 0.20
		for _, ref := range refs {
			if pageLower != "" && strings.Contains(pageLower, ref) {
				score += 0.10
				break
			}
		}
	}

	negativeSignals := map[string]float64{
		"define":   0.20,
		"explique": 0.20,
		"explica":  0.20,
		"mencione": 0.15,
		"enumere":  0.15,
		"resuma":   0.20,
		"concepto": 0.15,
		"teoria":   0.15,
	}
	for signal, weight := range negativeSignals {
		if strings.Contains(lower, signal) {
			score -= weight
		}
	}

	if len(strings.Fields(lower)) < 4 {
		score -= 0.10
	}

	if score < 0 {
		return 0
	}
	if score > 1 {
		return 1
	}
	return score
}

func isVisualCueQuestion(text string) bool {
	return calculateVisualCueScore(text, "") >= visualCueThreshold
}
