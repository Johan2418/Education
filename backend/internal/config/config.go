package config

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Server          ServerConfig
	Database        DatabaseConfig
	JWT             JWTConfig
	Email           EmailConfig
	HuggingFace     HuggingFaceConfig
	LibroIA         HuggingFaceConfig
	LibroAnalysis   HuggingFaceConfig
	LibroMCP        HuggingFaceConfig
	LibroModel      LibroModelConfig
	LibreOfficePath string
	ConversionAPI   ConversionAPIConfig
}

type HuggingFaceConfig struct {
	APIKey         string
	Model          string
	FallbackModel  string
	EnableFallback bool
	BaseURL        string
	TimeoutSeconds int
}

type LibroModelConfig struct {
	CandidateModels  []string
	BenchEnabled     bool
	TrainingRevision string
	BenchmarkBatchID string
}

type ConversionAPIConfig struct {
	URL       string
	APIKey    string
	Header    string
	Prefix    string
	FileField string
}

type EmailConfig struct {
	SMTPHost    string
	SMTPPort    int
	SMTPUser    string
	SMTPPass    string
	FromEmail   string
	FrontendURL string
}

type ServerConfig struct {
	Port string
}

type DatabaseConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
	SSLMode  string
}

func (d DatabaseConfig) DSN() string {
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=%s",
		d.User, d.Password, d.Host, d.Port, d.DBName, d.SSLMode,
	)
}

type JWTConfig struct {
	Secret              string
	ExpireHours         int
	AccessExpireMinutes int
	SessionExpireHours  int
}

func Load() *Config {
	loadDotEnvIfPresent()

	legacyExpireHours, hasLegacyExpireHours := envInt("JWT_EXPIRE_HOURS")
	accessExpireMinutes, hasAccessExpireMinutes := envInt("JWT_ACCESS_EXPIRE_MINUTES")
	sessionExpireHours := envOrDefaultInt("JWT_SESSION_EXPIRE_HOURS", 24)
	if sessionExpireHours <= 0 {
		sessionExpireHours = 24
	}

	if !hasAccessExpireMinutes || accessExpireMinutes <= 0 {
		if hasLegacyExpireHours && legacyExpireHours > 0 {
			accessExpireMinutes = legacyExpireHours * 60
		} else {
			accessExpireMinutes = 15
		}
	}

	// Keep legacy hours in config for compatibility and observability.
	effectiveLegacyExpireHours := 168
	if hasLegacyExpireHours && legacyExpireHours > 0 {
		effectiveLegacyExpireHours = legacyExpireHours
	}

	return &Config{
		Server: ServerConfig{
			Port: envOrDefault("SERVER_PORT", "8082"),
		},
		Database: DatabaseConfig{
			Host:     envOrDefault("DB_HOST", "localhost"),
			Port:     envOrDefaultInt("DB_PORT", 5432),
			User:     envRequired("DB_USER"),
			Password: envRequired("DB_PASSWORD"),
			DBName:   envOrDefault("DB_NAME", "education"),
			SSLMode:  envOrDefault("DB_SSLMODE", "disable"),
		},
		JWT: JWTConfig{
			Secret:              envRequired("JWT_SECRET"),
			ExpireHours:         effectiveLegacyExpireHours,
			AccessExpireMinutes: accessExpireMinutes,
			SessionExpireHours:  sessionExpireHours,
		},
		Email: EmailConfig{
			SMTPHost:    envOrDefault("SMTP_HOST", "smtp.gmail.com"),
			SMTPPort:    envOrDefaultInt("SMTP_PORT", 587),
			SMTPUser:    envOrDefault("SMTP_USER", ""),
			SMTPPass:    envOrDefault("SMTP_PASS", ""),
			FromEmail:   envOrDefault("SMTP_FROM", ""),
			FrontendURL: envOrDefault("FRONTEND_URL", "http://localhost:5173"),
		},
		HuggingFace: HuggingFaceConfig{
			APIKey:         envOrDefault("HUGGINGFACE_API_KEY", ""),
			Model:          envOrDefault("HUGGINGFACE_MODEL", "mistralai/Mistral-7B-Instruct-v0.3"),
			FallbackModel:  envOrDefault("HUGGINGFACE_FALLBACK_MODEL", ""),
			EnableFallback: envOrDefaultBool("HUGGINGFACE_ENABLE_FALLBACK", false),
			BaseURL:        envOrDefault("HUGGINGFACE_BASE_URL", "https://router.huggingface.co"),
			TimeoutSeconds: envOrDefaultInt("HUGGINGFACE_TIMEOUT_SECONDS", 30),
		},
		LibroIA: HuggingFaceConfig{
			APIKey:         envOrDefault("LIBRO_IA_API_KEY", envOrDefault("HUGGINGFACE_API_KEY", "")),
			Model:          envOrDefault("LIBRO_IA_MODEL", envOrDefault("HUGGINGFACE_MODEL", "mistralai/Mistral-7B-Instruct-v0.3")),
			FallbackModel:  envOrDefault("LIBRO_IA_FALLBACK_MODEL", envOrDefault("HUGGINGFACE_FALLBACK_MODEL", "")),
			EnableFallback: envOrDefaultBool("LIBRO_IA_ENABLE_FALLBACK", envOrDefaultBool("HUGGINGFACE_ENABLE_FALLBACK", false)),
			BaseURL:        envOrDefault("LIBRO_IA_BASE_URL", envOrDefault("HUGGINGFACE_BASE_URL", "https://router.huggingface.co")),
			TimeoutSeconds: envOrDefaultInt("LIBRO_IA_TIMEOUT_SECONDS", envOrDefaultInt("HUGGINGFACE_TIMEOUT_SECONDS", 30)),
		},
		LibroAnalysis: HuggingFaceConfig{
			APIKey: envOrDefault(
				"LIBRO_ANALYSIS_API_KEY",
				envOrDefault("LIBRO_IA_API_KEY", envOrDefault("HUGGINGFACE_API_KEY", "")),
			),
			Model: envOrDefault(
				"LIBRO_ANALYSIS_MODEL",
				envOrDefault("LIBRO_IA_MODEL", envOrDefault("HUGGINGFACE_MODEL", "mistralai/Mistral-7B-Instruct-v0.3")),
			),
			FallbackModel: envOrDefault(
				"LIBRO_ANALYSIS_FALLBACK_MODEL",
				envOrDefault("LIBRO_IA_FALLBACK_MODEL", envOrDefault("HUGGINGFACE_FALLBACK_MODEL", "")),
			),
			EnableFallback: envOrDefaultBool(
				"LIBRO_ANALYSIS_ENABLE_FALLBACK",
				envOrDefaultBool("LIBRO_IA_ENABLE_FALLBACK", envOrDefaultBool("HUGGINGFACE_ENABLE_FALLBACK", false)),
			),
			BaseURL: envOrDefault(
				"LIBRO_ANALYSIS_BASE_URL",
				envOrDefault("LIBRO_IA_BASE_URL", envOrDefault("HUGGINGFACE_BASE_URL", "https://router.huggingface.co")),
			),
			TimeoutSeconds: envOrDefaultInt(
				"LIBRO_ANALYSIS_TIMEOUT_SECONDS",
				envOrDefaultInt("LIBRO_IA_TIMEOUT_SECONDS", envOrDefaultInt("HUGGINGFACE_TIMEOUT_SECONDS", 30)),
			),
		},
		LibroMCP: HuggingFaceConfig{
			APIKey: envOrDefault(
				"LIBRO_MCP_API_KEY",
				envOrDefault("LIBRO_IA_API_KEY", envOrDefault("HUGGINGFACE_API_KEY", "")),
			),
			Model: envOrDefault(
				"LIBRO_MCP_MODEL",
				envOrDefault("LIBRO_IA_MODEL", envOrDefault("HUGGINGFACE_MODEL", "mistralai/Mistral-7B-Instruct-v0.3")),
			),
			FallbackModel: envOrDefault(
				"LIBRO_MCP_FALLBACK_MODEL",
				envOrDefault("LIBRO_IA_FALLBACK_MODEL", envOrDefault("HUGGINGFACE_FALLBACK_MODEL", "")),
			),
			EnableFallback: envOrDefaultBool(
				"LIBRO_MCP_ENABLE_FALLBACK",
				envOrDefaultBool("LIBRO_IA_ENABLE_FALLBACK", envOrDefaultBool("HUGGINGFACE_ENABLE_FALLBACK", false)),
			),
			BaseURL: envOrDefault(
				"LIBRO_MCP_BASE_URL",
				envOrDefault("LIBRO_IA_BASE_URL", envOrDefault("HUGGINGFACE_BASE_URL", "https://router.huggingface.co")),
			),
			TimeoutSeconds: envOrDefaultInt(
				"LIBRO_MCP_TIMEOUT_SECONDS",
				envOrDefaultInt("LIBRO_IA_TIMEOUT_SECONDS", envOrDefaultInt("HUGGINGFACE_TIMEOUT_SECONDS", 30)),
			),
		},
		LibroModel: LibroModelConfig{
			CandidateModels: envOrDefaultList(
				"OLLAMA_CANDIDATE_MODELS",
				[]string{
					"qwen2.5:1.5b",
					"qwen2.5:3b",
					"qwen2.5:latest",
					"llama3.2:3b",
					"phi3:mini",
				},
			),
			BenchEnabled: envOrDefaultBool("LIBRO_MODEL_BENCH_ENABLED", true),
			TrainingRevision: envOrDefault(
				"LIBRO_MODEL_TRAINING_REVISION",
				"2026.05.0",
			),
			BenchmarkBatchID: envOrDefault(
				"LIBRO_MODEL_BENCHMARK_BATCH_ID",
				envOrDefault(
					"LIBRO_MODEL_TRAINING_REVISION",
					"2026.05.0",
				),
			),
		},
		LibreOfficePath: envOrDefault("LIBREOFFICE_PATH", ""),
		ConversionAPI: ConversionAPIConfig{
			URL:       envOrDefault("PPTX_CONVERSION_API_URL", ""),
			APIKey:    envOrDefault("PPTX_CONVERSION_API_KEY", ""),
			Header:    envOrDefault("PPTX_CONVERSION_API_KEY_HEADER", "Authorization"),
			Prefix:    envOrDefault("PPTX_CONVERSION_API_KEY_PREFIX", "Bearer "),
			FileField: envOrDefault("PPTX_CONVERSION_API_FILE_FIELD", "file"),
		},
	}
}

func loadDotEnvIfPresent() {
	paths := []string{".env", "../.env", "../../.env"}
	for _, p := range paths {
		if err := loadDotEnvFile(p); err == nil {
			return
		}
	}
}

func loadDotEnvFile(path string) error {
	cleanPath := filepath.Clean(path)
	f, err := os.Open(cleanPath)
	if err != nil {
		return err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		idx := strings.Index(line, "=")
		if idx <= 0 {
			continue
		}

		key := strings.TrimSpace(line[:idx])
		value := strings.TrimSpace(line[idx+1:])
		if key == "" {
			continue
		}

		// Keep explicit shell env values as source of truth.
		if _, exists := os.LookupEnv(key); exists {
			continue
		}

		value = strings.Trim(value, `"`)
		_ = os.Setenv(key, value)
	}

	return scanner.Err()
}

func envRequired(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("FATAL: la variable de entorno %s es obligatoria y no está definida", key)
	}
	return v
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envOrDefaultInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envInt(key string) (int, bool) {
	v, exists := os.LookupEnv(key)
	if !exists || strings.TrimSpace(v) == "" {
		return 0, false
	}
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil {
		return 0, false
	}
	return n, true
}

func envOrDefaultBool(key string, fallback bool) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if v == "" {
		return fallback
	}
	if v == "1" || v == "true" || v == "yes" || v == "on" {
		return true
	}
	if v == "0" || v == "false" || v == "no" || v == "off" {
		return false
	}
	return fallback
}

func envOrDefaultList(key string, fallback []string) []string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		copied := make([]string, len(fallback))
		copy(copied, fallback)
		return copied
	}

	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
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

	if len(out) == 0 {
		copied := make([]string, len(fallback))
		copy(copied, fallback)
		return copied
	}
	return out
}
