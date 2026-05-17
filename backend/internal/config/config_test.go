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
