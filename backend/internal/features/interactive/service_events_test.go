package interactive

import (
	"encoding/json"
	"testing"
)

func TestExtractMetadataString(t *testing.T) {
	metadata := json.RawMessage(`{"event_id":"evt-123","event_origin":"https://h5p.org"}`)

	if got := extractMetadataString(metadata, "event_id"); got != "evt-123" {
		t.Fatalf("expected event_id evt-123, got %q", got)
	}

	if got := extractMetadataString(metadata, "event_origin"); got != "https://h5p.org" {
		t.Fatalf("expected event_origin https://h5p.org, got %q", got)
	}

	if got := extractMetadataString(metadata, "missing"); got != "" {
		t.Fatalf("expected empty string for missing key, got %q", got)
	}
}

func TestExtractAllowedOriginsFromConfig(t *testing.T) {
	config := json.RawMessage(`{"allowed_origins":["https://h5p.org","https://genially.com"]}`)
	origins := extractAllowedOriginsFromConfig(config)

	if len(origins) != 2 {
		t.Fatalf("expected 2 allowed origins, got %d", len(origins))
	}
	if origins[0] != "https://h5p.org" {
		t.Fatalf("unexpected first origin: %q", origins[0])
	}
}

func TestIsAllowedOrigin(t *testing.T) {
	allowlist := []string{"https://h5p.org", "https://genially.com"}

	if !isAllowedOrigin("https://h5p.org", allowlist) {
		t.Fatal("expected exact origin to be allowed")
	}

	if !isAllowedOrigin("https://cdn.h5p.org", allowlist) {
		t.Fatal("expected subdomain origin to be allowed")
	}

	if isAllowedOrigin("https://evil.example.com", allowlist) {
		t.Fatal("expected unknown origin to be rejected")
	}
}

func TestResolveScoreThresholdFromConfig(t *testing.T) {
	config := json.RawMessage(`{"score_threshold":82}`)
	if got := resolveScoreThresholdFromConfig(config); got != 82 {
		t.Fatalf("expected threshold 82, got %v", got)
	}

	config = json.RawMessage(`{"puntaje_minimo":110}`)
	if got := resolveScoreThresholdFromConfig(config); got != 100 {
		t.Fatalf("expected clamped threshold 100, got %v", got)
	}

	if got := resolveScoreThresholdFromConfig(nil); got != 70 {
		t.Fatalf("expected default threshold 70, got %v", got)
	}
}
