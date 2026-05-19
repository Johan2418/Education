package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"hash/fnv"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/arcanea/backend/internal/config"
	"github.com/arcanea/backend/internal/database"
	"gorm.io/gorm"
)

type snapshotEntry struct {
	Preguntas []map[string]interface{} `json:"preguntas"`
	Metadata  map[string]interface{}   `json:"metadata,omitempty"`
}

type extractionRow struct {
	TrabajoID      string          `gorm:"column:trabajo_id"`
	LibroRecursoID *string         `gorm:"column:libro_recurso_id"`
	Snapshots      json.RawMessage `gorm:"column:snapshots"`
	UpdatedAt      time.Time       `gorm:"column:updated_at"`
}

type chatRow struct {
	MessageID        string          `gorm:"column:message_id"`
	SessionID        string          `gorm:"column:session_id"`
	LibroRecursoID   string          `gorm:"column:libro_recurso_id"`
	UserMessage      string          `gorm:"column:user_message"`
	AssistantMessage string          `gorm:"column:assistant_message"`
	Metadata         json.RawMessage `gorm:"column:metadata"`
	Model            *string         `gorm:"column:model"`
	CreatedAt        time.Time       `gorm:"column:created_at"`
}

type feedbackRow struct {
	MessageID string    `gorm:"column:message_id"`
	Reaction  string    `gorm:"column:reaction"`
	Comment   string    `gorm:"column:comment"`
	CreatedAt time.Time `gorm:"column:created_at"`
}

type datasetSummary struct {
	AnalysisTrain int `json:"analysis_train"`
	AnalysisEval  int `json:"analysis_eval"`
	MCPTrain      int `json:"mcp_train"`
	MCPEval       int `json:"mcp_eval"`
}

func main() {
	var (
		outDir        string
		windowDays    int
		evalPercent   int
		analysisLimit int
		mcpLimit      int
	)

	flag.StringVar(&outDir, "out-dir", filepath.Join("qa-reports", "libro-datasets"), "output base directory")
	flag.IntVar(&windowDays, "window-days", 120, "lookback window in days")
	flag.IntVar(&evalPercent, "eval-percent", 20, "percentage of records routed to eval split")
	flag.IntVar(&analysisLimit, "analysis-limit", 0, "optional cap for analysis samples (0 = no cap)")
	flag.IntVar(&mcpLimit, "mcp-limit", 0, "optional cap for mcp samples (0 = no cap)")
	flag.Parse()

	if windowDays <= 0 {
		windowDays = 120
	}
	if evalPercent < 0 {
		evalPercent = 0
	}
	if evalPercent > 100 {
		evalPercent = 100
	}

	cfg := config.Load()
	db, err := database.Connect(cfg.Database)
	if err != nil {
		log.Fatalf("db: %v", err)
	}

	since := time.Now().AddDate(0, 0, -windowDays)

	summary, err := exportDatasets(db, outDir, since, evalPercent, analysisLimit, mcpLimit)
	if err != nil {
		log.Fatalf("dataset export failed: %v", err)
	}

	payload := map[string]interface{}{
		"generated_at": time.Now().UTC().Format(time.RFC3339),
		"since":        since.UTC().Format(time.RFC3339),
		"window_days":  windowDays,
		"eval_percent": evalPercent,
		"output_dir":   outDir,
		"counts":       summary,
	}
	b, _ := json.MarshalIndent(payload, "", "  ")
	fmt.Println(string(b))
}

func exportDatasets(db *gorm.DB, outDir string, since time.Time, evalPercent int, analysisLimit int, mcpLimit int) (*datasetSummary, error) {
	analysisTrainPath := filepath.Join(outDir, "analysis_train", "train.jsonl")
	analysisEvalPath := filepath.Join(outDir, "analysis_train", "eval.jsonl")
	mcpTrainPath := filepath.Join(outDir, "mcp_guardrail_train", "train.jsonl")
	mcpEvalPath := filepath.Join(outDir, "mcp_guardrail_train", "eval.jsonl")

	if err := os.MkdirAll(filepath.Dir(analysisTrainPath), 0o755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(mcpTrainPath), 0o755); err != nil {
		return nil, err
	}

	analysisTrainWriter, closeAnalysisTrain, err := newJSONLWriter(analysisTrainPath)
	if err != nil {
		return nil, err
	}
	defer closeAnalysisTrain()

	analysisEvalWriter, closeAnalysisEval, err := newJSONLWriter(analysisEvalPath)
	if err != nil {
		return nil, err
	}
	defer closeAnalysisEval()

	mcpTrainWriter, closeMCPTrain, err := newJSONLWriter(mcpTrainPath)
	if err != nil {
		return nil, err
	}
	defer closeMCPTrain()

	mcpEvalWriter, closeMCPEval, err := newJSONLWriter(mcpEvalPath)
	if err != nil {
		return nil, err
	}
	defer closeMCPEval()

	summary := &datasetSummary{}

	if err := exportAnalysisRows(db, since, analysisLimit, evalPercent, analysisTrainWriter, analysisEvalWriter, summary); err != nil {
		return nil, err
	}
	if err := exportMCPRows(db, since, mcpLimit, evalPercent, mcpTrainWriter, mcpEvalWriter, summary); err != nil {
		return nil, err
	}

	return summary, nil
}

func exportAnalysisRows(db *gorm.DB, since time.Time, limit int, evalPercent int, trainWriter *bufio.Writer, evalWriter *bufio.Writer, summary *datasetSummary) error {
	query := db.
		Table("internal.libro_extraccion").
		Select("trabajo_id, libro_recurso_id, snapshots, updated_at").
		Where("updated_at >= ? AND estado::text = 'aprobado' AND confirmado_por IS NOT NULL AND snapshots IS NOT NULL AND snapshots::text <> '{}'", since).
		Order("updated_at DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}

	var rows []extractionRow
	if err := query.Scan(&rows).Error; err != nil {
		return err
	}

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

		modelTag := metadataString(aiRaw.Metadata, "model_tag")
		if modelTag == "" {
			modelTag = metadataString(aiRaw.Metadata, "model_name")
		}
		reviewPages := extractPagesFromSnapshotQuestions(reviewFinal.Preguntas)
		sourcePages, sourceText := loadSourcePages(db, row.LibroRecursoID, reviewPages)

		record := map[string]interface{}{
			"id":     fmt.Sprintf("analysis:%s", row.TrabajoID),
			"task":   "analysis_extraction",
			"source": "internal.libro_extraccion.snapshots",
			"metadata": map[string]interface{}{
				"trabajo_id":       row.TrabajoID,
				"model_tag":        normalizeModelTag(modelTag),
				"updated_at":       row.UpdatedAt.UTC().Format(time.RFC3339),
				"ai_preguntas":     len(aiRaw.Preguntas),
				"review_preguntas": len(reviewFinal.Preguntas),
			},
			"input": map[string]interface{}{
				"ai_raw":        aiRaw,
				"source_pages":  sourcePages,
				"source_text":   sourceText,
				"review_pages":  reviewPages,
				"source_loaded": len(sourcePages) > 0,
			},
			"target": map[string]interface{}{
				"review_final": reviewFinal,
			},
		}

		if shouldGoToEval(recordID(record), evalPercent) {
			if err := writeJSONL(evalWriter, record); err != nil {
				return err
			}
			summary.AnalysisEval++
		} else {
			if err := writeJSONL(trainWriter, record); err != nil {
				return err
			}
			summary.AnalysisTrain++
		}
	}

	return nil
}

func exportMCPRows(db *gorm.DB, since time.Time, limit int, evalPercent int, trainWriter *bufio.Writer, evalWriter *bufio.Writer, summary *datasetSummary) error {
	feedbackIndex, err := loadFeedbackIndex(db, since)
	if err != nil {
		return err
	}

	baseQuery := `
		SELECT
			a.id::text AS message_id,
			a.session_id::text AS session_id,
			s.libro_recurso_id::text AS libro_recurso_id,
			COALESCE(u.content, '') AS user_message,
			a.content AS assistant_message,
			a.metadata,
			a.model,
			a.created_at
		FROM internal.libro_chat_message a
		JOIN internal.libro_chat_session s ON s.id = a.session_id
		LEFT JOIN LATERAL (
			SELECT content
			FROM internal.libro_chat_message u
			WHERE u.session_id = a.session_id
				AND u.role = 'user'
				AND u.created_at <= a.created_at
			ORDER BY u.created_at DESC
			LIMIT 1
		) u ON TRUE
		WHERE a.role = 'assistant'
			AND a.created_at >= ?
		ORDER BY a.created_at DESC`

	if limit > 0 {
		baseQuery = baseQuery + fmt.Sprintf(" LIMIT %d", limit)
	}

	var rows []chatRow
	if err := db.Raw(baseQuery, since).Scan(&rows).Error; err != nil {
		return err
	}

	for _, row := range rows {
		metadataMap := map[string]interface{}{}
		if len(row.Metadata) > 0 {
			_ = json.Unmarshal(row.Metadata, &metadataMap)
		}
		policyMode := extractMapString(metadataMap, "policy_mode")
		guardrailReason := extractMapString(metadataMap, "guardrail_reason")
		modelTag := extractMapString(metadataMap, "model_tag")
		if modelTag == "" && row.Model != nil {
			modelTag = strings.TrimSpace(*row.Model)
		}
		guardrailApplied := extractMapBool(metadataMap, "guardrail_applied")

		record := map[string]interface{}{
			"id":     fmt.Sprintf("mcp:%s", row.MessageID),
			"task":   taskFromPolicy(policyMode),
			"source": "internal.libro_chat_message",
			"metadata": map[string]interface{}{
				"message_id":        row.MessageID,
				"session_id":        row.SessionID,
				"libro_recurso_id":  row.LibroRecursoID,
				"policy_mode":       policyMode,
				"guardrail_applied": guardrailApplied,
				"guardrail_reason":  guardrailReason,
				"model_tag":         normalizeModelTag(modelTag),
				"created_at":        row.CreatedAt.UTC().Format(time.RFC3339),
			},
			"input": map[string]interface{}{
				"user_message": row.UserMessage,
			},
			"target": map[string]interface{}{
				"assistant_message": row.AssistantMessage,
			},
		}

		if fb, ok := feedbackIndex[row.MessageID]; ok {
			record["feedback"] = fb
		}

		if shouldGoToEval(recordID(record), evalPercent) {
			if err := writeJSONL(evalWriter, record); err != nil {
				return err
			}
			summary.MCPEval++
		} else {
			if err := writeJSONL(trainWriter, record); err != nil {
				return err
			}
			summary.MCPTrain++
		}
	}

	return nil
}

func loadFeedbackIndex(db *gorm.DB, since time.Time) (map[string]map[string]interface{}, error) {
	var rows []feedbackRow
	if err := db.
		Table("internal.libro_chat_telemetria").
		Select("metadata->>'message_id' AS message_id, metadata->>'reaction' AS reaction, COALESCE(metadata->>'comment', '') AS comment, created_at").
		Where("event_type = 'chat_feedback' AND created_at >= ? AND COALESCE(metadata->>'message_id', '') <> ''", since).
		Order("created_at ASC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	index := make(map[string]map[string]interface{}, len(rows))
	for _, row := range rows {
		id := strings.TrimSpace(row.MessageID)
		if id == "" {
			continue
		}
		index[id] = map[string]interface{}{
			"reaction":   strings.TrimSpace(row.Reaction),
			"comment":    strings.TrimSpace(row.Comment),
			"created_at": row.CreatedAt.UTC().Format(time.RFC3339),
		}
	}
	return index, nil
}

func newJSONLWriter(path string) (*bufio.Writer, func() error, error) {
	file, err := os.Create(path)
	if err != nil {
		return nil, nil, err
	}
	writer := bufio.NewWriterSize(file, 1024*128)
	closeFn := func() error {
		if err := writer.Flush(); err != nil {
			_ = file.Close()
			return err
		}
		return file.Close()
	}
	return writer, closeFn, nil
}

func writeJSONL(writer *bufio.Writer, record map[string]interface{}) error {
	line, err := json.Marshal(record)
	if err != nil {
		return err
	}
	if _, err := writer.Write(line); err != nil {
		return err
	}
	if err := writer.WriteByte('\n'); err != nil {
		return err
	}
	return nil
}

func taskFromPolicy(policyMode string) string {
	if strings.EqualFold(strings.TrimSpace(policyMode), "student_summary_hints") {
		return "mcp_student_guardrail"
	}
	return "mcp_teacher_chat"
}

func shouldGoToEval(id string, evalPercent int) bool {
	if evalPercent <= 0 {
		return false
	}
	if evalPercent >= 100 {
		return true
	}
	h := fnv.New32a()
	_, _ = h.Write([]byte(id))
	bucket := int(h.Sum32() % 100)
	return bucket < evalPercent
}

func recordID(record map[string]interface{}) string {
	if raw, ok := record["id"]; ok {
		if asString, ok := raw.(string); ok {
			return asString
		}
	}
	b, _ := json.Marshal(record)
	return string(b)
}

func metadataString(meta map[string]interface{}, key string) string {
	if len(meta) == 0 {
		return ""
	}
	if raw, ok := meta[key]; ok {
		switch value := raw.(type) {
		case string:
			return strings.TrimSpace(value)
		case fmt.Stringer:
			return strings.TrimSpace(value.String())
		}
	}
	return ""
}

func extractMapString(meta map[string]interface{}, key string) string {
	if len(meta) == 0 {
		return ""
	}
	if raw, ok := meta[key]; ok {
		switch value := raw.(type) {
		case string:
			return strings.TrimSpace(value)
		case float64:
			return strings.TrimSpace(fmt.Sprintf("%v", value))
		case bool:
			if value {
				return "true"
			}
			return "false"
		}
	}
	return ""
}

func extractMapBool(meta map[string]interface{}, key string) bool {
	raw := strings.ToLower(strings.TrimSpace(extractMapString(meta, key)))
	switch raw {
	case "true", "1", "yes", "on":
		return true
	default:
		return false
	}
}

func normalizeModelTag(modelTag string) string {
	trimmed := strings.TrimSpace(modelTag)
	if trimmed == "" {
		return "unknown"
	}
	return trimmed
}

func extractPagesFromSnapshotQuestions(questions []map[string]interface{}) []int {
	if len(questions) == 0 {
		return nil
	}
	pageSet := map[int]struct{}{}
	for _, question := range questions {
		raw, ok := question["pagina_libro"]
		if !ok {
			continue
		}
		switch value := raw.(type) {
		case float64:
			page := int(value)
			if page > 0 {
				pageSet[page] = struct{}{}
			}
		case int:
			if value > 0 {
				pageSet[value] = struct{}{}
			}
		}
	}
	pages := make([]int, 0, len(pageSet))
	for page := range pageSet {
		pages = append(pages, page)
	}
	sort.Ints(pages)
	return pages
}

func loadSourcePages(db *gorm.DB, recursoID *string, pages []int) ([]map[string]interface{}, string) {
	if recursoID == nil || strings.TrimSpace(*recursoID) == "" || len(pages) == 0 {
		return nil, ""
	}
	type pageRow struct {
		Pagina    int    `gorm:"column:pagina"`
		Contenido string `gorm:"column:contenido"`
	}
	var rows []pageRow
	if err := db.
		Table("internal.libro_contenido_pagina").
		Select("pagina, contenido").
		Where("libro_recurso_id = ? AND pagina IN ?", strings.TrimSpace(*recursoID), pages).
		Order("pagina ASC").
		Limit(12).
		Scan(&rows).Error; err != nil {
		return nil, ""
	}
	if len(rows) == 0 {
		return nil, ""
	}
	sourcePages := make([]map[string]interface{}, 0, len(rows))
	var builder strings.Builder
	for _, row := range rows {
		content := strings.TrimSpace(row.Contenido)
		if content == "" {
			continue
		}
		if len(content) > 2000 {
			content = content[:2000] + "..."
		}
		sourcePages = append(sourcePages, map[string]interface{}{
			"pagina":    row.Pagina,
			"contenido": content,
		})
		if builder.Len() > 0 {
			builder.WriteString("\n\n")
		}
		builder.WriteString(fmt.Sprintf("[PAGINA %d]\n%s", row.Pagina, content))
	}
	return sourcePages, builder.String()
}
