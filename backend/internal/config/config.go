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
	Server      ServerConfig
	Database    DatabaseConfig
	JWT         JWTConfig
	Email       EmailConfig
	HuggingFace HuggingFaceConfig
	LibroIA     HuggingFaceConfig
}

type HuggingFaceConfig struct {
	APIKey         string
	Model          string
	FallbackModel  string
	EnableFallback bool
	BaseURL        string
	TimeoutSeconds int
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
	Secret      string
	ExpireHours int
}

func Load() *Config {
	loadDotEnvIfPresent()

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
			Secret:      envRequired("JWT_SECRET"),
			ExpireHours: envOrDefaultInt("JWT_EXPIRE_HOURS", 168), // 7 days
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
