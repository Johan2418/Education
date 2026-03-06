package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	Email    EmailConfig
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
	return &Config{
		Server: ServerConfig{
			Port: envOrDefault("SERVER_PORT", "8082"),
		},
		Database: DatabaseConfig{
			Host:     envOrDefault("DB_HOST", "localhost"),
			Port:     envOrDefaultInt("DB_PORT", 5433),
			User:     envOrDefault("DB_USER", "cross_education_admin"),
			Password: envOrDefault("DB_PASSWORD", "123456"),
			DBName:   envOrDefault("DB_NAME", "education"),
			SSLMode:  envOrDefault("DB_SSLMODE", "disable"),
		},
		JWT: JWTConfig{
			Secret:      envOrDefault("JWT_SECRET", "nrIqtHlnp9PaFmpuIEEnDcDig/fDq7Z2dac7OZQ1730="),
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
	}
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
