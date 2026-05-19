package config

import (
	"reflect"
	"testing"
)

func setRequiredEnv(t *testing.T) {
	t.Helper()
	t.Setenv("DB_USER", "test_user")
	t.Setenv("DB_PASSWORD", "test_pass")
	t.Setenv("JWT_SECRET", "test_jwt_secret_32_chars_minimum")
}

func TestLoadLibroProfileFallbackToLegacy(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("LIBRO_IA_MODEL", "legacy-model")
	t.Setenv("LIBRO_ANALYSIS_MODEL", "")
	t.Setenv("LIBRO_MCP_MODEL", "")

	cfg := Load()

	if cfg.LibroAnalysis.Model != "legacy-model" {
		t.Fatalf("expected analysis profile to fallback to legacy model, got %q", cfg.LibroAnalysis.Model)
	}
	if cfg.LibroMCP.Model != "legacy-model" {
		t.Fatalf("expected mcp profile to fallback to legacy model, got %q", cfg.LibroMCP.Model)
	}
}

func TestLoadLibroModelConfigDefaults(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("OLLAMA_CANDIDATE_MODELS", "")
	t.Setenv("LIBRO_MODEL_BENCH_ENABLED", "")
	t.Setenv("LIBRO_MODEL_TRAINING_REVISION", "")
	t.Setenv("LIBRO_MODEL_BENCHMARK_BATCH_ID", "")

	cfg := Load()

	expectedDefaults := []string{
		"qwen2.5:1.5b",
		"qwen2.5:3b",
		"qwen2.5:latest",
		"llama3.2:3b",
		"phi3:mini",
	}
	if !reflect.DeepEqual(cfg.LibroModel.CandidateModels, expectedDefaults) {
		t.Fatalf("unexpected candidate model defaults: %#v", cfg.LibroModel.CandidateModels)
	}
	if !cfg.LibroModel.BenchEnabled {
		t.Fatalf("expected benchmark to be enabled by default")
	}
	if cfg.LibroModel.TrainingRevision != "2026.05.0" {
		t.Fatalf("unexpected default training revision: %q", cfg.LibroModel.TrainingRevision)
	}
	if cfg.LibroModel.BenchmarkBatchID != "2026.05.0" {
		t.Fatalf("unexpected default benchmark batch id: %q", cfg.LibroModel.BenchmarkBatchID)
	}
}

func TestLoadLibroModelConfigOverrides(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("OLLAMA_CANDIDATE_MODELS", " qwen2.5:3b, qwen2.5:3b,phi3:mini ")
	t.Setenv("LIBRO_MODEL_BENCH_ENABLED", "false")
	t.Setenv("LIBRO_MODEL_TRAINING_REVISION", "2026.05.3")
	t.Setenv("LIBRO_MODEL_BENCHMARK_BATCH_ID", "batch-2026-05-14")

	cfg := Load()

	expected := []string{"qwen2.5:3b", "phi3:mini"}
	if !reflect.DeepEqual(cfg.LibroModel.CandidateModels, expected) {
		t.Fatalf("unexpected parsed candidate list: %#v", cfg.LibroModel.CandidateModels)
	}
	if cfg.LibroModel.BenchEnabled {
		t.Fatalf("expected benchmark to be disabled")
	}
	if cfg.LibroModel.TrainingRevision != "2026.05.3" {
		t.Fatalf("unexpected training revision: %q", cfg.LibroModel.TrainingRevision)
	}
	if cfg.LibroModel.BenchmarkBatchID != "batch-2026-05-14" {
		t.Fatalf("unexpected benchmark batch id: %q", cfg.LibroModel.BenchmarkBatchID)
	}
}

func TestLoadLibroAsyncConfigDefaults(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("LIBRO_EXTRACT_WORKERS", "")
	t.Setenv("LIBRO_EXTRACT_QUEUE_SIZE", "")
	t.Setenv("LIBRO_EXTRACT_JOB_TTL_MINUTES", "")

	cfg := Load()

	if cfg.LibroAsync.ExtractWorkers != 2 {
		t.Fatalf("unexpected default extract workers: %d", cfg.LibroAsync.ExtractWorkers)
	}
	if cfg.LibroAsync.ExtractQueueSize != 100 {
		t.Fatalf("unexpected default extract queue size: %d", cfg.LibroAsync.ExtractQueueSize)
	}
	if cfg.LibroAsync.ExtractJobTTLMinutes != 60 {
		t.Fatalf("unexpected default extract job ttl: %d", cfg.LibroAsync.ExtractJobTTLMinutes)
	}
}

func TestLoadLibroAsyncConfigOverrides(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("LIBRO_EXTRACT_WORKERS", "4")
	t.Setenv("LIBRO_EXTRACT_QUEUE_SIZE", "240")
	t.Setenv("LIBRO_EXTRACT_JOB_TTL_MINUTES", "90")

	cfg := Load()

	if cfg.LibroAsync.ExtractWorkers != 4 {
		t.Fatalf("unexpected extract workers override: %d", cfg.LibroAsync.ExtractWorkers)
	}
	if cfg.LibroAsync.ExtractQueueSize != 240 {
		t.Fatalf("unexpected extract queue size override: %d", cfg.LibroAsync.ExtractQueueSize)
	}
	if cfg.LibroAsync.ExtractJobTTLMinutes != 90 {
		t.Fatalf("unexpected extract job ttl override: %d", cfg.LibroAsync.ExtractJobTTLMinutes)
	}
}

func TestLoadLibroExtractionConfigDefaults(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("LIBRO_IA_MIN_CONFIDENCE", "")
	t.Setenv("LIBRO_IA_MIN_CLOSED_CONFIDENCE", "")
	t.Setenv("LIBRO_IA_MIN_SHORT_FIDELITY", "")
	t.Setenv("LIBRO_IA_MIN_LONG_FIDELITY", "")
	t.Setenv("LIBRO_IA_MIN_QUESTION_CHARS", "")
	t.Setenv("LIBRO_IA_MIN_QUESTION_TOKENS", "")
	t.Setenv("LIBRO_IA_HEURISTIC_SENTENCE_MIN_CHARS", "")

	cfg := Load()
	extract := cfg.LibroIA.LibroExtraction

	if extract.MinConfidence != 0.55 {
		t.Fatalf("unexpected default min confidence: %.2f", extract.MinConfidence)
	}
	if extract.MinClosedConfidence != 0.72 {
		t.Fatalf("unexpected default min closed confidence: %.2f", extract.MinClosedConfidence)
	}
	if extract.ShortFidelityMin != 0.72 {
		t.Fatalf("unexpected default short fidelity: %.2f", extract.ShortFidelityMin)
	}
	if extract.LongFidelityMin != 0.78 {
		t.Fatalf("unexpected default long fidelity: %.2f", extract.LongFidelityMin)
	}
	if extract.MinQuestionChars != 20 {
		t.Fatalf("unexpected default min chars: %d", extract.MinQuestionChars)
	}
	if extract.MinQuestionTokens != 4 {
		t.Fatalf("unexpected default min tokens: %d", extract.MinQuestionTokens)
	}
	if extract.HeuristicSentenceMinChars != 28 {
		t.Fatalf("unexpected default heuristic sentence min chars: %d", extract.HeuristicSentenceMinChars)
	}
}

func TestLoadLibroExtractionConfigProfileFallbackAndOverrides(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("LIBRO_IA_MIN_CONFIDENCE", "0.61")
	t.Setenv("LIBRO_IA_MIN_CLOSED_CONFIDENCE", "0.79")
	t.Setenv("LIBRO_IA_MIN_SHORT_FIDELITY", "0.80")
	t.Setenv("LIBRO_IA_MIN_LONG_FIDELITY", "0.83")
	t.Setenv("LIBRO_IA_MIN_QUESTION_CHARS", "26")
	t.Setenv("LIBRO_IA_MIN_QUESTION_TOKENS", "5")
	t.Setenv("LIBRO_IA_HEURISTIC_SENTENCE_MIN_CHARS", "34")
	t.Setenv("LIBRO_ANALYSIS_MIN_CONFIDENCE", "0.67")
	t.Setenv("LIBRO_ANALYSIS_MIN_CLOSED_CONFIDENCE", "0.81")

	cfg := Load()

	if cfg.LibroAnalysis.LibroExtraction.MinConfidence != 0.67 {
		t.Fatalf("expected analysis min confidence override, got %.2f", cfg.LibroAnalysis.LibroExtraction.MinConfidence)
	}
	if cfg.LibroAnalysis.LibroExtraction.MinClosedConfidence != 0.81 {
		t.Fatalf("expected analysis min closed confidence override, got %.2f", cfg.LibroAnalysis.LibroExtraction.MinClosedConfidence)
	}
	if cfg.LibroAnalysis.LibroExtraction.MinQuestionChars != 26 {
		t.Fatalf("expected analysis min chars to inherit LIBRO_IA, got %d", cfg.LibroAnalysis.LibroExtraction.MinQuestionChars)
	}
	if cfg.LibroMCP.LibroExtraction.MinQuestionTokens != 5 {
		t.Fatalf("expected MCP min tokens to inherit LIBRO_IA, got %d", cfg.LibroMCP.LibroExtraction.MinQuestionTokens)
	}
	if cfg.LibroMCP.LibroExtraction.MinClosedConfidence != 0.79 {
		t.Fatalf("expected MCP min closed confidence to inherit LIBRO_IA, got %.2f", cfg.LibroMCP.LibroExtraction.MinClosedConfidence)
	}
	if cfg.LibroMCP.LibroExtraction.HeuristicSentenceMinChars != 34 {
		t.Fatalf("expected MCP heuristic sentence min chars to inherit LIBRO_IA, got %d", cfg.LibroMCP.LibroExtraction.HeuristicSentenceMinChars)
	}
}
