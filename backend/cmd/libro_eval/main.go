package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/arcanea/backend/internal/config"
	"github.com/arcanea/backend/internal/database"
	"gorm.io/gorm"
)

type snapshotQuestion struct {
	Texto       string `json:"texto"`
	PaginaLibro *int   `json:"pagina_libro"`
}

type snapshotEntry struct {
	Preguntas []snapshotQuestion     `json:"preguntas"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

type extractionRow struct {
	TrabajoID string          `gorm:"column:trabajo_id"`
	Snapshots json.RawMessage `gorm:"column:snapshots"`
	UpdatedAt time.Time       `gorm:"column:updated_at"`
}

type modelEvalMetrics struct {
	ModelTag               string  `json:"model_tag"`
	ExtractionsWithReview  int     `json:"extractions_with_review"`
	ReviewQuestionsTotal   int     `json:"review_questions_total"`
	ExtractionMatchTotal   int     `json:"extraction_match_total"`
	PageMatchTotal         int     `json:"page_match_total"`
	ExtractionPrecisionPct float64 `json:"extraction_precision_pct"`
	PageAccuracyPct        float64 `json:"page_accuracy_pct"`
	AssistantMessagesTotal int64   `json:"assistant_messages_total"`
	GuardrailAppliedTotal  int64   `json:"guardrail_applied_total"`
	GuardrailLeakTotal     int64   `json:"guardrail_leak_total"`
	GuardrailLeakRatePct   float64 `json:"guardrail_leak_rate_pct"`
	AssistantLatencyAvgMs  float64 `json:"assistant_latency_avg_ms"`
}

type modelAccumulator struct {
	modelTag               string
	extractionsWithReview  int
	reviewQuestionsTotal   int
	extractionMatchTotal   int
	pageMatchTotal         int
	assistantMessagesTotal int64
	guardrailAppliedTotal  int64
	guardrailLeakTotal     int64
	assistantLatencyAvgMs  float64
}

type evalMetrics struct {
	WindowDays                    int                `json:"window_days"`
	Since                         time.Time          `json:"since"`
	GeneratedAt                   time.Time          `json:"generated_at"`
	ExtractionsWithSnapshots      int                `json:"extractions_with_snapshots"`
	ReviewQuestionsTotal          int                `json:"review_questions_total"`
	ExtractionMatchTotal          int                `json:"extraction_match_total"`
	PageMatchTotal                int                `json:"page_match_total"`
	ExtractionPrecisionPct        float64            `json:"extraction_precision_pct"`
	PageAccuracyPct               float64            `json:"page_accuracy_pct"`
	AssistantLatencyAvgMs         float64            `json:"assistant_latency_avg_ms"`
	StudentAssistantMessagesTotal int64              `json:"student_assistant_messages_total"`
	StudentGuardrailAppliedTotal  int64              `json:"student_guardrail_applied_total"`
	StudentGuardrailLeakTotal     int64              `json:"student_guardrail_leak_total"`
	StudentGuardrailLeakRatePct   float64            `json:"student_guardrail_leak_rate_pct"`
	StudentGuardrailEfficacyPct   float64            `json:"student_guardrail_efficacy_pct"`
	ByModel                       []modelEvalMetrics `json:"by_model,omitempty"`
}

func main() {
	var (
		windowDays    int
		repeatMinutes int
	)
	flag.IntVar(&windowDays, "window-days", 30, "lookback window in days")
	flag.IntVar(&repeatMinutes, "repeat-minutes", 0, "repeat evaluation every N minutes (0 = run once)")
	flag.Parse()

	if windowDays <= 0 {
		windowDays = 30
	}

	cfg := config.Load()
	db, err := database.Connect(cfg.Database)
	if err != nil {
		log.Fatalf("db: %v", err)
	}

	run := func() {
		metrics, evalErr := computeMetrics(db, windowDays)
		if evalErr != nil {
			log.Printf("libro_eval error: %v", evalErr)
			return
		}
		b, marshalErr := json.MarshalIndent(metrics, "", "  ")
		if marshalErr != nil {
			log.Printf("marshal error: %v", marshalErr)
			return
		}
		fmt.Println(string(b))
	}

	run()
	if repeatMinutes <= 0 {
		return
	}

	ticker := time.NewTicker(time.Duration(repeatMinutes) * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		run()
	}
}

func computeMetrics(db *gorm.DB, windowDays int) (*evalMetrics, error) {
	since := time.Now().AddDate(0, 0, -windowDays)
	metrics := &evalMetrics{
		WindowDays:  windowDays,
		Since:       since.UTC(),
		GeneratedAt: time.Now().UTC(),
	}

	modelStats := map[string]*modelAccumulator{}

	var rows []extractionRow
	if err := db.
		Table("internal.libro_extraccion").
		Select("trabajo_id, snapshots, updated_at").
		Where("updated_at >= ? AND snapshots IS NOT NULL AND snapshots::text <> '{}'", since).
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	metrics.ExtractionsWithSnapshots = len(rows)

	for _, row := range rows {
		var snapshots map[string]snapshotEntry
		if err := json.Unmarshal(row.Snapshots, &snapshots); err != nil {
			continue
		}
		aiRaw, hasAIRaw := snapshots["ai_raw"]
		reviewFinal, hasReview := snapshots["review_final"]
		if !hasAIRaw || !hasReview || len(reviewFinal.Preguntas) == 0 {
			continue
		}

		modelTag := normalizeModelTag(snapshotModelTag(aiRaw))
		model := getModelAccumulator(modelStats, modelTag)
		model.extractionsWithReview++

		aiByText := make(map[string]snapshotQuestion, len(aiRaw.Preguntas))
		for _, q := range aiRaw.Preguntas {
			key := normalizeQuestionText(q.Texto)
			if key == "" {
				continue
			}
			if _, exists := aiByText[key]; !exists {
				aiByText[key] = q
			}
		}

		for _, review := range reviewFinal.Preguntas {
			key := normalizeQuestionText(review.Texto)
			if key == "" {
				continue
			}
			metrics.ReviewQuestionsTotal++
			model.reviewQuestionsTotal++

			source, found := aiByText[key]
			if !found {
				continue
			}
			metrics.ExtractionMatchTotal++
			model.extractionMatchTotal++
			if samePage(source.PaginaLibro, review.PaginaLibro) {
				metrics.PageMatchTotal++
				model.pageMatchTotal++
			}
		}
	}

	if metrics.ReviewQuestionsTotal > 0 {
		metrics.ExtractionPrecisionPct = pct(float64(metrics.ExtractionMatchTotal), float64(metrics.ReviewQuestionsTotal))
	}
	if metrics.ExtractionMatchTotal > 0 {
		metrics.PageAccuracyPct = pct(float64(metrics.PageMatchTotal), float64(metrics.ExtractionMatchTotal))
	}

	var latency struct {
		Avg float64 `gorm:"column:avg_latency_ms"`
	}
	if err := db.
		Table("internal.libro_chat_message m").
		Select("COALESCE(AVG(m.latency_ms), 0)::double precision AS avg_latency_ms").
		Where("m.role = 'assistant' AND m.created_at >= ?", since).
		Scan(&latency).Error; err == nil {
		metrics.AssistantLatencyAvgMs = latency.Avg
	}

	type guardrailAgg struct {
		Total        int64 `gorm:"column:total"`
		AppliedTotal int64 `gorm:"column:applied_total"`
		LeakTotal    int64 `gorm:"column:leak_total"`
	}
	var guardrail guardrailAgg
	if err := db.
		Table("internal.libro_chat_message m").
		Select(`
			COUNT(*)::bigint AS total,
			COALESCE(SUM(CASE
				WHEN COALESCE(m.metadata->>'policy_mode', '') = 'student_summary_hints'
					AND COALESCE((NULLIF(m.metadata->>'guardrail_applied', ''))::boolean, false) THEN 1
				ELSE 0
			END), 0)::bigint AS applied_total,
			COALESCE(SUM(CASE
				WHEN COALESCE(m.metadata->>'policy_mode', '') = 'student_summary_hints'
					AND LOWER(m.content) ~ '(la respuesta es|respuesta correcta|opcion correcta|solucion final|answer:)' THEN 1
				ELSE 0
			END), 0)::bigint AS leak_total
		`).
		Where("m.role = 'assistant' AND m.created_at >= ?", since).
		Scan(&guardrail).Error; err == nil {
		metrics.StudentAssistantMessagesTotal = guardrail.Total
		metrics.StudentGuardrailAppliedTotal = guardrail.AppliedTotal
		metrics.StudentGuardrailLeakTotal = guardrail.LeakTotal
		if guardrail.Total > 0 {
			metrics.StudentGuardrailLeakRatePct = pct(float64(guardrail.LeakTotal), float64(guardrail.Total))
			metrics.StudentGuardrailEfficacyPct = 100 - metrics.StudentGuardrailLeakRatePct
		}
	}

	type modelChatAgg struct {
		ModelTag               string  `gorm:"column:model_tag"`
		AssistantMessagesTotal int64   `gorm:"column:assistant_messages_total"`
		GuardrailAppliedTotal  int64   `gorm:"column:guardrail_applied_total"`
		GuardrailLeakTotal     int64   `gorm:"column:guardrail_leak_total"`
		AssistantLatencyAvgMs  float64 `gorm:"column:assistant_latency_avg_ms"`
	}
	var modelChatRows []modelChatAgg
	if err := db.
		Table("internal.libro_chat_message m").
		Select(`
			COALESCE(NULLIF(TRIM(COALESCE(m.metadata->>'model_tag', m.model, '')), ''), 'unknown') AS model_tag,
			COUNT(*)::bigint AS assistant_messages_total,
			COALESCE(SUM(CASE
				WHEN COALESCE(m.metadata->>'policy_mode', '') = 'student_summary_hints'
					AND COALESCE((NULLIF(m.metadata->>'guardrail_applied', ''))::boolean, false) THEN 1
				ELSE 0
			END), 0)::bigint AS guardrail_applied_total,
			COALESCE(SUM(CASE
				WHEN COALESCE(m.metadata->>'policy_mode', '') = 'student_summary_hints'
					AND LOWER(m.content) ~ '(la respuesta es|respuesta correcta|opcion correcta|solucion final|answer:)' THEN 1
				ELSE 0
			END), 0)::bigint AS guardrail_leak_total,
			COALESCE(AVG(m.latency_ms), 0)::double precision AS assistant_latency_avg_ms
		`).
		Where("m.role = 'assistant' AND m.created_at >= ?", since).
		Group("model_tag").
		Scan(&modelChatRows).Error; err == nil {
		for _, row := range modelChatRows {
			model := getModelAccumulator(modelStats, normalizeModelTag(row.ModelTag))
			model.assistantMessagesTotal = row.AssistantMessagesTotal
			model.guardrailAppliedTotal = row.GuardrailAppliedTotal
			model.guardrailLeakTotal = row.GuardrailLeakTotal
			model.assistantLatencyAvgMs = row.AssistantLatencyAvgMs
		}
	}

	modelTags := make([]string, 0, len(modelStats))
	for modelTag := range modelStats {
		modelTags = append(modelTags, modelTag)
	}
	sort.Strings(modelTags)

	metrics.ByModel = make([]modelEvalMetrics, 0, len(modelTags))
	for _, modelTag := range modelTags {
		item := modelStats[modelTag]
		row := modelEvalMetrics{
			ModelTag:               item.modelTag,
			ExtractionsWithReview:  item.extractionsWithReview,
			ReviewQuestionsTotal:   item.reviewQuestionsTotal,
			ExtractionMatchTotal:   item.extractionMatchTotal,
			PageMatchTotal:         item.pageMatchTotal,
			AssistantMessagesTotal: item.assistantMessagesTotal,
			GuardrailAppliedTotal:  item.guardrailAppliedTotal,
			GuardrailLeakTotal:     item.guardrailLeakTotal,
			AssistantLatencyAvgMs:  item.assistantLatencyAvgMs,
		}
		if row.ReviewQuestionsTotal > 0 {
			row.ExtractionPrecisionPct = pct(float64(row.ExtractionMatchTotal), float64(row.ReviewQuestionsTotal))
		}
		if row.ExtractionMatchTotal > 0 {
			row.PageAccuracyPct = pct(float64(row.PageMatchTotal), float64(row.ExtractionMatchTotal))
		}
		if row.AssistantMessagesTotal > 0 {
			row.GuardrailLeakRatePct = pct(float64(row.GuardrailLeakTotal), float64(row.AssistantMessagesTotal))
		}
		metrics.ByModel = append(metrics.ByModel, row)
	}

	return metrics, nil
}

func snapshotModelTag(entry snapshotEntry) string {
	if len(entry.Metadata) == 0 {
		return ""
	}
	if raw, ok := entry.Metadata["model_tag"]; ok {
		if asString, ok := raw.(string); ok {
			return asString
		}
	}
	if raw, ok := entry.Metadata["model_name"]; ok {
		if asString, ok := raw.(string); ok {
			return asString
		}
	}
	return ""
}

func getModelAccumulator(index map[string]*modelAccumulator, modelTag string) *modelAccumulator {
	normalized := normalizeModelTag(modelTag)
	if item, ok := index[normalized]; ok {
		return item
	}
	item := &modelAccumulator{modelTag: normalized}
	index[normalized] = item
	return item
}

func normalizeModelTag(modelTag string) string {
	trimmed := strings.TrimSpace(modelTag)
	if trimmed == "" {
		return "unknown"
	}
	return trimmed
}

func normalizeQuestionText(text string) string {
	trimmed := strings.ToLower(strings.TrimSpace(text))
	if trimmed == "" {
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
	return strings.Join(strings.Fields(replacer.Replace(trimmed)), " ")
}

func samePage(a *int, b *int) bool {
	if a == nil || b == nil {
		return false
	}
	return *a > 0 && *a == *b
}

func pct(num, den float64) float64 {
	if den <= 0 {
		return 0
	}
	return (num / den) * 100
}
