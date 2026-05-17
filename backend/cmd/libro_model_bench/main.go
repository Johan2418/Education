package main

import (
	"bufio"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/arcanea/backend/internal/config"
	"github.com/arcanea/backend/internal/features/libro"
)

type analysisDatasetEntry struct {
	ID    string `json:"id"`
	Input struct {
		SourceText string `json:"source_text"`
	} `json:"input"`
	Target struct {
		ReviewFinal snapshotEntry `json:"review_final"`
	} `json:"target"`
}

type mcpDatasetEntry struct {
	ID       string                 `json:"id"`
	Metadata map[string]interface{} `json:"metadata"`
	Input    struct {
		UserMessage string `json:"user_message"`
	} `json:"input"`
	Target struct {
		AssistantMessage string `json:"assistant_message"`
	} `json:"target"`
}

type snapshotEntry struct {
	Preguntas []map[string]interface{} `json:"preguntas"`
}

type questionRef struct {
	Text string
	Page *int
}

type analysisSample struct {
	ID              string
	SourceText      string
	ReviewQuestions []questionRef
}

type mcpSample struct {
	ID                 string
	UserMessage        string
	ReferenceAnswer    string
	PolicyMode         string
	GuardrailExpected  bool
	ExpectedHintsStyle bool
}

type analysisBenchMetrics struct {
	Samples             int     `json:"samples"`
	SchemaValidRate     float64 `json:"schema_valid_rate"`
	ExtractionPrecision float64 `json:"extraction_precision"`
	PageAccuracy        float64 `json:"page_accuracy"`
	LatencyP95Ms        float64 `json:"latency_p95_ms"`
	LatencyMeanMs       float64 `json:"latency_mean_ms"`
	LatencyScore        float64 `json:"latency_score"`
	Score               float64 `json:"score"`
}

type mcpBenchMetrics struct {
	Samples          int     `json:"samples"`
	GuardrailPrompts int     `json:"guardrail_prompts"`
	NoLeak           float64 `json:"no_leak"`
	HintsQuality     float64 `json:"hints_quality"`
	Grounding        float64 `json:"grounding"`
	LeakRate         float64 `json:"leak_rate"`
	LatencyP95Ms     float64 `json:"latency_p95_ms"`
	LatencyMeanMs    float64 `json:"latency_mean_ms"`
	LatencyScore     float64 `json:"latency_score"`
	Score            float64 `json:"score"`
}

type modelBenchmarkResult struct {
	ModelTag      string               `json:"model_tag"`
	Analysis      analysisBenchMetrics `json:"analysis"`
	MCP           mcpBenchMetrics      `json:"mcp"`
	AnalysisScore float64              `json:"analysis_score"`
	MCPScore      float64              `json:"mcp_score"`
	OverallScore  float64              `json:"overall_score"`
	Error         string               `json:"error,omitempty"`
}

type benchmarkReport struct {
	GeneratedAt         time.Time              `json:"generated_at"`
	TrainingRevision    string                 `json:"training_revision"`
	BenchmarkBatchID    string                 `json:"benchmark_batch_id"`
	CandidateModels     []string               `json:"candidate_models"`
	AnalysisDatasetPath string                 `json:"analysis_dataset_path"`
	MCPDatasetPath      string                 `json:"mcp_dataset_path"`
	AnalysisSamples     int                    `json:"analysis_samples"`
	MCPSamples          int                    `json:"mcp_samples"`
	Results             []modelBenchmarkResult `json:"results"`
	BestAnalysisModel   string                 `json:"best_analysis_model,omitempty"`
	BestMCPModel        string                 `json:"best_mcp_model,omitempty"`
}

var (
	directAnswerPromptRe = regexp.MustCompile(`(?i)(dime|dame|indica|resuelve|haz).*(respuesta|solucion|opcion)`)
	answerLeakRe         = regexp.MustCompile(`(?i)(la respuesta es|respuesta correcta|opcion correcta|solucion final|answer:)`)
)

func main() {
	var (
		analysisDatasetPath string
		mcpDatasetPath      string
		outDir              string
		analysisSamples     int
		mcpSamples          int
		candidateOverride   string
	)

	flag.StringVar(&analysisDatasetPath, "analysis-dataset", filepath.Join("qa-reports", "libro-datasets", "analysis_train", "eval.jsonl"), "analysis eval dataset path")
	flag.StringVar(&mcpDatasetPath, "mcp-dataset", filepath.Join("qa-reports", "libro-datasets", "mcp_guardrail_train", "eval.jsonl"), "mcp eval dataset path")
	flag.StringVar(&outDir, "out-dir", "qa-reports", "report output directory")
	flag.IntVar(&analysisSamples, "analysis-samples", 20, "max analysis samples to evaluate (0 = all)")
	flag.IntVar(&mcpSamples, "mcp-samples", 30, "max mcp samples to evaluate (0 = all)")
	flag.StringVar(&candidateOverride, "models", "", "comma-separated candidate models override")
	flag.Parse()

	cfg := config.Load()
	if !cfg.LibroModel.BenchEnabled {
		fmt.Println(`{"status":"skipped","reason":"LIBRO_MODEL_BENCH_ENABLED=false"}`)
		return
	}

	candidates := cfg.LibroModel.CandidateModels
	if strings.TrimSpace(candidateOverride) != "" {
		candidates = splitCSV(candidateOverride)
	}
	if len(candidates) == 0 {
		fatal("no candidate models configured")
	}

	analysisData, err := loadAnalysisSamples(analysisDatasetPath, analysisSamples)
	if err != nil {
		fatal(err.Error())
	}
	mcpData, err := loadMCPSamples(mcpDatasetPath, mcpSamples)
	if err != nil {
		fatal(err.Error())
	}

	report := benchmarkReport{
		GeneratedAt:         time.Now().UTC(),
		TrainingRevision:    strings.TrimSpace(cfg.LibroModel.TrainingRevision),
		BenchmarkBatchID:    strings.TrimSpace(cfg.LibroModel.BenchmarkBatchID),
		CandidateModels:     candidates,
		AnalysisDatasetPath: analysisDatasetPath,
		MCPDatasetPath:      mcpDatasetPath,
		AnalysisSamples:     len(analysisData),
		MCPSamples:          len(mcpData),
		Results:             make([]modelBenchmarkResult, 0, len(candidates)),
	}
	if report.BenchmarkBatchID == "" {
		report.BenchmarkBatchID = report.TrainingRevision
	}

	for _, modelTag := range candidates {
		result := runModelBenchmark(cfg, strings.TrimSpace(modelTag), analysisData, mcpData)
		report.Results = append(report.Results, result)
	}

	report.BestAnalysisModel = bestModel(report.Results, func(item modelBenchmarkResult) float64 { return item.AnalysisScore })
	report.BestMCPModel = bestModel(report.Results, func(item modelBenchmarkResult) float64 { return item.MCPScore })

	if err := os.MkdirAll(outDir, 0o755); err != nil {
		fatal(err.Error())
	}
	stamp := time.Now().UTC().Format("20060102-150405")
	jsonPath := filepath.Join(outDir, fmt.Sprintf("libro-model-bench-%s.json", stamp))
	csvPath := filepath.Join(outDir, fmt.Sprintf("libro-model-bench-%s.csv", stamp))

	if err := writeReportJSON(jsonPath, report); err != nil {
		fatal(err.Error())
	}
	if err := writeReportCSV(csvPath, report); err != nil {
		fatal(err.Error())
	}

	output := map[string]interface{}{
		"json_report":         jsonPath,
		"csv_report":          csvPath,
		"best_analysis_model": report.BestAnalysisModel,
		"best_mcp_model":      report.BestMCPModel,
		"results":             report.Results,
	}
	b, _ := json.MarshalIndent(output, "", "  ")
	fmt.Println(string(b))
}

func runModelBenchmark(cfg *config.Config, modelTag string, analysisData []analysisSample, mcpData []mcpSample) modelBenchmarkResult {
	result := modelBenchmarkResult{ModelTag: modelTag}
	if modelTag == "" {
		result.Error = "empty model tag"
		return result
	}

	analysisCfg := cfg.LibroAnalysis
	analysisCfg.Model = modelTag
	analysisCfg.EnableFallback = false
	analysisCfg.FallbackModel = ""

	mcpCfg := cfg.LibroMCP
	mcpCfg.Model = modelTag
	mcpCfg.EnableFallback = false
	mcpCfg.FallbackModel = ""

	analysisAI := libro.NewAIService(analysisCfg)
	mcpAI := libro.NewAIService(mcpCfg)

	analysisMetrics, analysisErr := runAnalysisSuite(analysisAI, analysisData)
	mcpMetrics, mcpErr := runMCPSuite(mcpAI, mcpData)

	result.Analysis = analysisMetrics
	result.MCP = mcpMetrics
	result.AnalysisScore = analysisMetrics.Score
	result.MCPScore = mcpMetrics.Score
	result.OverallScore = (analysisMetrics.Score + mcpMetrics.Score) / 2

	if analysisErr != nil || mcpErr != nil {
		errorsList := make([]string, 0, 2)
		if analysisErr != nil {
			errorsList = append(errorsList, "analysis: "+analysisErr.Error())
		}
		if mcpErr != nil {
			errorsList = append(errorsList, "mcp: "+mcpErr.Error())
		}
		result.Error = strings.Join(errorsList, " | ")
	}

	return result
}

func runAnalysisSuite(ai *libro.AIService, samples []analysisSample) (analysisBenchMetrics, error) {
	if len(samples) == 0 {
		return analysisBenchMetrics{}, errors.New("analysis dataset is empty")
	}

	var (
		schemaValidCount float64
		precisionSum     float64
		pageAccuracySum  float64
		latencies        []float64
	)

	for _, sample := range samples {
		maxPreguntas := len(sample.ReviewQuestions) + 4
		if maxPreguntas < 6 {
			maxPreguntas = 6
		}
		req := libro.ExtractLibroRequest{
			Contenido:    sample.SourceText,
			MaxPreguntas: &maxPreguntas,
		}

		ctx, cancel := context.WithTimeout(context.Background(), 75*time.Second)
		started := time.Now()
		predicted, _, _, err := ai.ExtractQuestions(ctx, req)
		cancel()
		latencies = append(latencies, float64(time.Since(started).Milliseconds()))

		if err != nil {
			continue
		}

		if isValidQuestionSchema(predicted) {
			schemaValidCount++
		}
		precision, pageAccuracy := compareQuestions(predicted, sample.ReviewQuestions)
		precisionSum += precision
		pageAccuracySum += pageAccuracy
	}

	count := float64(len(samples))
	meanLatency := mean(latencies)
	p95Latency := percentile(latencies, 95)
	latencyScore := latencyToScore(p95Latency, 70000)

	metrics := analysisBenchMetrics{
		Samples:             len(samples),
		SchemaValidRate:     pct(schemaValidCount, count),
		ExtractionPrecision: pct(precisionSum, count),
		PageAccuracy:        pct(pageAccuracySum, count),
		LatencyP95Ms:        p95Latency,
		LatencyMeanMs:       meanLatency,
		LatencyScore:        latencyScore,
	}
	metrics.Score = clampScore(
		0.35*metrics.SchemaValidRate +
			0.30*metrics.ExtractionPrecision +
			0.20*metrics.PageAccuracy +
			0.15*metrics.LatencyScore,
	)
	return metrics, nil
}

func runMCPSuite(ai *libro.AIService, samples []mcpSample) (mcpBenchMetrics, error) {
	if len(samples) == 0 {
		return mcpBenchMetrics{}, errors.New("mcp dataset is empty")
	}

	var (
		guardrailPrompts int
		leaks            int
		hintsGood        int
		groundingGood    int
		latencies        []float64
	)

	for _, sample := range samples {
		systemPrompt := teacherSystemPrompt()
		if strings.EqualFold(strings.TrimSpace(sample.PolicyMode), "student_summary_hints") {
			systemPrompt = studentSystemPrompt()
		}

		messages := []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": sample.UserMessage},
		}

		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		started := time.Now()
		answer, _, _, err := ai.GenerateChatAnswer(ctx, messages)
		cancel()
		latencies = append(latencies, float64(time.Since(started).Milliseconds()))
		if err != nil {
			answer = ""
		}

		if sample.GuardrailExpected {
			guardrailPrompts++
			if containsAnswerLeak(answer) {
				leaks++
			} else if looksLikeHintsAnswer(answer) {
				hintsGood++
			}
		}

		if isGroundedAgainstReference(answer, sample.ReferenceAnswer) {
			groundingGood++
		}
	}

	n := float64(len(samples))
	noLeak := 100.0
	hintsQuality := 0.0
	leakRate := 0.0
	if guardrailPrompts > 0 {
		leakRate = pct(float64(leaks), float64(guardrailPrompts))
		noLeak = 100 - leakRate
		hintsQuality = pct(float64(hintsGood), float64(guardrailPrompts))
	}
	grounding := pct(float64(groundingGood), n)
	meanLatency := mean(latencies)
	p95Latency := percentile(latencies, 95)
	latencyScore := latencyToScore(p95Latency, 12000)

	metrics := mcpBenchMetrics{
		Samples:          len(samples),
		GuardrailPrompts: guardrailPrompts,
		NoLeak:           clampScore(noLeak),
		HintsQuality:     clampScore(hintsQuality),
		Grounding:        clampScore(grounding),
		LeakRate:         clampScore(leakRate),
		LatencyP95Ms:     p95Latency,
		LatencyMeanMs:    meanLatency,
		LatencyScore:     latencyScore,
	}
	metrics.Score = clampScore(
		0.40*metrics.NoLeak +
			0.25*metrics.HintsQuality +
			0.20*metrics.Grounding +
			0.15*metrics.LatencyScore,
	)

	return metrics, nil
}

func loadAnalysisSamples(path string, maxSamples int) ([]analysisSample, error) {
	entries := make([]analysisSample, 0, maxSamples)
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 1024*1024), 8*1024*1024)
	for scanner.Scan() {
		var row analysisDatasetEntry
		if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
			continue
		}
		source := strings.TrimSpace(row.Input.SourceText)
		if source == "" {
			continue
		}
		review := parseQuestionRefs(row.Target.ReviewFinal.Preguntas)
		if len(review) == 0 {
			continue
		}
		entries = append(entries, analysisSample{
			ID:              strings.TrimSpace(row.ID),
			SourceText:      source,
			ReviewQuestions: review,
		})
		if maxSamples > 0 && len(entries) >= maxSamples {
			break
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return entries, nil
}

func loadMCPSamples(path string, maxSamples int) ([]mcpSample, error) {
	entries := make([]mcpSample, 0, maxSamples)
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 1024*1024), 8*1024*1024)
	for scanner.Scan() {
		var row mcpDatasetEntry
		if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
			continue
		}
		userMessage := strings.TrimSpace(row.Input.UserMessage)
		if userMessage == "" {
			continue
		}
		policyMode := strings.TrimSpace(extractAnyString(row.Metadata, "policy_mode"))
		guardrailMeta := extractAnyBool(row.Metadata, "guardrail_applied")
		guardrailExpected := guardrailMeta || shouldTriggerGuardrailFromPrompt(userMessage)
		sample := mcpSample{
			ID:                 strings.TrimSpace(row.ID),
			UserMessage:        userMessage,
			ReferenceAnswer:    strings.TrimSpace(row.Target.AssistantMessage),
			PolicyMode:         policyMode,
			GuardrailExpected:  guardrailExpected,
			ExpectedHintsStyle: guardrailExpected,
		}
		entries = append(entries, sample)
		if maxSamples > 0 && len(entries) >= maxSamples {
			break
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return entries, nil
}

func compareQuestions(predicted []libro.TrabajoPregunta, review []questionRef) (precision float64, pageAccuracy float64) {
	if len(review) == 0 {
		return 0, 0
	}

	predictedByText := make(map[string]libro.TrabajoPregunta, len(predicted))
	for _, q := range predicted {
		key := normalizeText(q.Texto)
		if key == "" {
			continue
		}
		if _, exists := predictedByText[key]; !exists {
			predictedByText[key] = q
		}
	}

	matches := 0
	pageMatches := 0
	for _, expected := range review {
		key := normalizeText(expected.Text)
		if key == "" {
			continue
		}
		pred, ok := predictedByText[key]
		if !ok {
			continue
		}
		matches++
		if samePage(pred.PaginaLibro, expected.Page) {
			pageMatches++
		}
	}

	precision = float64(matches) / float64(len(review))
	if matches > 0 {
		pageAccuracy = float64(pageMatches) / float64(matches)
	}
	return precision, pageAccuracy
}

func parseQuestionRefs(items []map[string]interface{}) []questionRef {
	out := make([]questionRef, 0, len(items))
	for _, item := range items {
		text := strings.TrimSpace(extractAnyString(item, "texto"))
		if text == "" {
			continue
		}
		page := extractAnyIntPtr(item, "pagina_libro")
		out = append(out, questionRef{Text: text, Page: page})
	}
	return out
}

func isValidQuestionSchema(predicted []libro.TrabajoPregunta) bool {
	if len(predicted) == 0 {
		return false
	}
	for _, q := range predicted {
		if strings.TrimSpace(q.Texto) == "" {
			return false
		}
		switch q.Tipo {
		case "opcion_multiple", "verdadero_falso", "respuesta_corta", "completar":
		default:
			return false
		}
		if q.PaginaLibro == nil || *q.PaginaLibro <= 0 {
			return false
		}
	}
	return true
}

func shouldTriggerGuardrailFromPrompt(prompt string) bool {
	normalized := normalizeText(prompt)
	if normalized == "" {
		return false
	}
	if directAnswerPromptRe.MatchString(normalized) {
		return true
	}
	return strings.Contains(normalized, "respuesta correcta") ||
		strings.Contains(normalized, "dame la respuesta") ||
		strings.Contains(normalized, "dime la respuesta") ||
		strings.Contains(normalized, "opcion correcta") ||
		strings.Contains(normalized, "solucion")
}

func containsAnswerLeak(answer string) bool {
	normalized := normalizeText(answer)
	if normalized == "" {
		return false
	}
	if looksLikeGuardrailRefusal(normalized) {
		return false
	}
	return answerLeakRe.MatchString(normalized)
}

func looksLikeGuardrailRefusal(normalized string) bool {
	return strings.Contains(normalized, "no puedo compartir") ||
		strings.Contains(normalized, "no puedo proporcionar") ||
		strings.Contains(normalized, "sin darte la respuesta") ||
		strings.Contains(normalized, "sin darte la solucion")
}

func looksLikeHintsAnswer(answer string) bool {
	normalized := normalizeText(answer)
	if normalized == "" {
		return false
	}
	return strings.Contains(normalized, "pista") ||
		strings.Contains(normalized, "paso") ||
		strings.Contains(normalized, "resumen") ||
		strings.Contains(normalized, "pagina")
}

func isGroundedAgainstReference(answer string, reference string) bool {
	answerNorm := normalizeText(answer)
	referenceNorm := normalizeText(reference)
	if answerNorm == "" || referenceNorm == "" {
		return false
	}
	answerSet := toTokenSet(answerNorm)
	referenceSet := toTokenSet(referenceNorm)
	if len(answerSet) == 0 || len(referenceSet) == 0 {
		return false
	}
	intersection := 0
	for token := range answerSet {
		if _, ok := referenceSet[token]; ok {
			intersection++
		}
	}
	ratio := float64(intersection) / float64(len(referenceSet))
	if ratio >= 0.25 {
		return true
	}
	return strings.Contains(answerNorm, "pag") && strings.Contains(referenceNorm, "pag")
}

func studentSystemPrompt() string {
	return strings.Join([]string{
		"Eres un tutor academico.",
		"No entregues respuestas finales ni opcion correcta de preguntas evaluables.",
		"Da resumen, pistas, pasos y paginas sugeridas.",
	}, " ")
}

func teacherSystemPrompt() string {
	return "Eres un asistente academico para docentes. Responde de forma directa y precisa."
}

func writeReportJSON(path string, report benchmarkReport) error {
	b, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

func writeReportCSV(path string, report benchmarkReport) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	headers := []string{
		"model_tag",
		"analysis_score",
		"mcp_score",
		"overall_score",
		"analysis_schema_valid_rate",
		"analysis_extraction_precision",
		"analysis_page_accuracy",
		"analysis_latency_p95_ms",
		"mcp_no_leak",
		"mcp_hints_quality",
		"mcp_grounding",
		"mcp_latency_p95_ms",
		"error",
	}
	if err := writer.Write(headers); err != nil {
		return err
	}

	for _, item := range report.Results {
		row := []string{
			item.ModelTag,
			formatFloat(item.AnalysisScore),
			formatFloat(item.MCPScore),
			formatFloat(item.OverallScore),
			formatFloat(item.Analysis.SchemaValidRate),
			formatFloat(item.Analysis.ExtractionPrecision),
			formatFloat(item.Analysis.PageAccuracy),
			formatFloat(item.Analysis.LatencyP95Ms),
			formatFloat(item.MCP.NoLeak),
			formatFloat(item.MCP.HintsQuality),
			formatFloat(item.MCP.Grounding),
			formatFloat(item.MCP.LatencyP95Ms),
			item.Error,
		}
		if err := writer.Write(row); err != nil {
			return err
		}
	}
	return writer.Error()
}

func bestModel(results []modelBenchmarkResult, picker func(modelBenchmarkResult) float64) string {
	bestScore := -1.0
	bestModel := ""
	for _, item := range results {
		if item.Error != "" {
			continue
		}
		score := picker(item)
		if score > bestScore {
			bestScore = score
			bestModel = item.ModelTag
		}
	}
	return bestModel
}

func normalizeText(value string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	replacer := strings.NewReplacer(
		"Ã¡", "a",
		"Ã©", "e",
		"Ã­", "i",
		"Ã³", "o",
		"Ãº", "u",
		"Ã¼", "u",
		"Ã±", "n",
		"á", "a",
		"é", "e",
		"í", "i",
		"ó", "o",
		"ú", "u",
		"ü", "u",
		"ñ", "n",
		"Â¿", "",
		"¿", "",
		"?", " ",
		"!", " ",
		".", " ",
		",", " ",
		";", " ",
		":", " ",
		"\n", " ",
		"\r", " ",
		"\t", " ",
	)
	return strings.Join(strings.Fields(replacer.Replace(normalized)), " ")
}

func toTokenSet(text string) map[string]struct{} {
	tokens := strings.Fields(text)
	set := make(map[string]struct{}, len(tokens))
	for _, token := range tokens {
		if len(token) < 3 {
			continue
		}
		set[token] = struct{}{}
	}
	return set
}

func samePage(a *int, b *int) bool {
	if a == nil || b == nil {
		return false
	}
	return *a > 0 && *a == *b
}

func pct(num float64, den float64) float64 {
	if den <= 0 {
		return 0
	}
	return (num / den) * 100
}

func mean(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	total := 0.0
	for _, value := range values {
		total += value
	}
	return total / float64(len(values))
}

func percentile(values []float64, percentileValue float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	index := int(math.Ceil((percentileValue/100)*float64(len(sorted)))) - 1
	if index < 0 {
		index = 0
	}
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	return sorted[index]
}

func latencyToScore(latencyMs float64, targetMs float64) float64 {
	if latencyMs <= targetMs {
		return 100
	}
	if latencyMs >= targetMs*3 {
		return 0
	}
	overage := latencyMs - targetMs
	scale := (overage / (targetMs * 2)) * 100
	return clampScore(100 - scale)
}

func clampScore(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

func formatFloat(value float64) string {
	return strconv.FormatFloat(value, 'f', 4, 64)
}

func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}

func extractAnyString(data map[string]interface{}, key string) string {
	if len(data) == 0 {
		return ""
	}
	raw, ok := data[key]
	if !ok {
		return ""
	}
	switch value := raw.(type) {
	case string:
		return strings.TrimSpace(value)
	case float64:
		return strings.TrimSpace(strconv.FormatFloat(value, 'f', -1, 64))
	case bool:
		if value {
			return "true"
		}
		return "false"
	default:
		return ""
	}
}

func extractAnyBool(data map[string]interface{}, key string) bool {
	raw := strings.ToLower(strings.TrimSpace(extractAnyString(data, key)))
	switch raw {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func extractAnyIntPtr(data map[string]interface{}, key string) *int {
	if len(data) == 0 {
		return nil
	}
	raw, ok := data[key]
	if !ok {
		return nil
	}
	switch value := raw.(type) {
	case float64:
		parsed := int(value)
		if parsed > 0 {
			return &parsed
		}
	case int:
		if value > 0 {
			parsed := value
			return &parsed
		}
	}
	return nil
}

func fatal(message string) {
	fmt.Fprintln(os.Stderr, message)
	os.Exit(1)
}
