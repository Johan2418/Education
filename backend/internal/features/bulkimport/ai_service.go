package bulkimport

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/arcanea/backend/internal/config"
)

// KnownFields are the fields the system understands.
var KnownFields = []string{"display_name", "email", "cedula", "phone", "ignore"}

type AIService struct {
	apiKey     string
	model      string
	baseURL    string
	httpClient *http.Client
}

func NewAIService(cfg config.HuggingFaceConfig) *AIService {
	timeoutSeconds := cfg.TimeoutSeconds
	if timeoutSeconds <= 0 {
		timeoutSeconds = 30
	}

	return &AIService{
		apiKey: cfg.APIKey,
		model:  cfg.Model,
		baseURL: strings.TrimRight(
			cfg.BaseURL,
			"/",
		),
		httpClient: &http.Client{
			Timeout: time.Duration(timeoutSeconds) * time.Second,
		},
	}
}

// MapColumns uses Hugging Face Inference API to map Excel column headers
// to known fields. Falls back to heuristic matching if AI is unavailable.
func (s *AIService) MapColumns(ctx context.Context, headers []string) (*ColumnMappingResponse, error) {
	if strings.TrimSpace(s.model) == "" || strings.TrimSpace(s.baseURL) == "" {
		log.Println("bulkimport: AI provider config is incomplete, using heuristic mapping")
		return s.heuristicMapping(headers), nil
	}

	if s.apiKey == "" && strings.Contains(strings.ToLower(s.baseURL), "huggingface.co") {
		log.Println("bulkimport: no HuggingFace API key configured for Hugging Face endpoint, using heuristic mapping")
		return s.heuristicMapping(headers), nil
	}

	result, err := s.aiMapping(ctx, headers)
	if err != nil {
		log.Printf("bulkimport: AI mapping failed (%v), falling back to heuristic", err)
		return s.heuristicMapping(headers), nil
	}
	return result, nil
}

// aiMapping calls the Hugging Face Inference API.
func (s *AIService) aiMapping(ctx context.Context, headers []string) (*ColumnMappingResponse, error) {
	prompt := buildMappingPrompt(headers)

	if s.shouldUseHFInference() {
		if out, err := s.aiMappingHFInference(ctx, prompt, headers); err == nil {
			return out, nil
		}
	}

	// Some models are only exposed through the Router chat-completions interface.
	return s.aiMappingChat(ctx, prompt, headers)
}

func (s *AIService) aiMappingHFInference(ctx context.Context, prompt string, headers []string) (*ColumnMappingResponse, error) {
	payload := map[string]interface{}{
		"inputs":     prompt,
		"parameters": map[string]interface{}{"max_new_tokens": 300, "temperature": 0.1, "return_full_text": false},
	}
	body, _ := json.Marshal(payload)

	url := fmt.Sprintf("%s/hf-inference/models/%s", s.baseURL, s.model)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	if s.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+s.apiKey)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HF request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HF returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return parseAIResponse(respBody, headers)
}

func (s *AIService) aiMappingChat(ctx context.Context, prompt string, headers []string) (*ColumnMappingResponse, error) {
	maxTokens := 400
	payload := map[string]interface{}{}
	if s.isLocalProvider() {
		maxTokens = 180
		payload["options"] = map[string]interface{}{
			"num_ctx":     1024,
			"num_predict": maxTokens,
		}
	}

	payload["model"] = s.model
	payload["messages"] = []map[string]string{
		{"role": "user", "content": prompt},
	}
	payload["temperature"] = 0.1
	payload["max_tokens"] = maxTokens
	body, _ := json.Marshal(payload)

	url := s.baseURL + "/v1/chat/completions"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	if s.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+s.apiKey)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HF chat request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HF chat returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return parseAIChatResponse(respBody, headers)
}

func buildMappingPrompt(headers []string) string {
	return fmt.Sprintf(`[INST] You are a data-mapping assistant. Given these Excel column headers, map each one to exactly one of these fields: display_name, email, cedula, phone, ignore.

Column headers: %s

Return ONLY a valid JSON array like:
[{"header":"...","field":"..."},...]

Rules:
- "display_name" = full name, nombre, nombre completo, apellido+nombre, etc.
- "email" = correo, email, e-mail, correo electrónico
- "cedula" = cédula, CI, identificación, documento, DNI, número de identificación
- "phone" = teléfono, celular, móvil, phone
- Everything else = "ignore"

JSON output: [/INST]`, strings.Join(headers, ", "))
}

func parseAIResponse(body []byte, headers []string) (*ColumnMappingResponse, error) {
	// HF returns an array of generated text objects
	var hfResp []struct {
		GeneratedText string `json:"generated_text"`
	}
	if err := json.Unmarshal(body, &hfResp); err != nil {
		return nil, fmt.Errorf("failed to parse HF response: %w", err)
	}
	if len(hfResp) == 0 {
		return nil, fmt.Errorf("empty HF response")
	}

	text := hfResp[0].GeneratedText
	// Extract JSON array from the response
	start := strings.Index(text, "[")
	end := strings.LastIndex(text, "]")
	if start == -1 || end == -1 || end <= start {
		return nil, fmt.Errorf("no JSON array found in AI response")
	}
	jsonStr := text[start : end+1]

	var mappings []FieldMapping
	if err := json.Unmarshal([]byte(jsonStr), &mappings); err != nil {
		return nil, fmt.Errorf("failed to parse mapping JSON: %w", err)
	}

	// Validate fields
	validFields := map[string]bool{}
	for _, f := range KnownFields {
		validFields[f] = true
	}
	for i := range mappings {
		if !validFields[mappings[i].Field] {
			mappings[i].Field = "ignore"
		}
	}

	return &ColumnMappingResponse{Mappings: mappings}, nil
}

func (s *AIService) shouldUseHFInference() bool {
	return s.apiKey != "" && strings.Contains(strings.ToLower(s.baseURL), "huggingface.co")
}

func (s *AIService) isLocalProvider() bool {
	base := strings.ToLower(strings.TrimSpace(s.baseURL))
	return strings.Contains(base, "localhost") || strings.Contains(base, "127.0.0.1") || strings.Contains(base, "ollama")
}

func parseAIChatResponse(body []byte, headers []string) (*ColumnMappingResponse, error) {
	var chatResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(body, &chatResp); err != nil {
		return nil, fmt.Errorf("failed to parse HF chat response: %w", err)
	}
	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("empty HF chat response")
	}

	text := chatResp.Choices[0].Message.Content
	start := strings.Index(text, "[")
	end := strings.LastIndex(text, "]")
	if start == -1 || end == -1 || end <= start {
		return nil, fmt.Errorf("no JSON array found in chat response")
	}
	jsonStr := text[start : end+1]

	var mappings []FieldMapping
	if err := json.Unmarshal([]byte(jsonStr), &mappings); err != nil {
		return nil, fmt.Errorf("failed to parse chat mapping JSON: %w", err)
	}

	validFields := map[string]bool{}
	for _, f := range KnownFields {
		validFields[f] = true
	}
	for i := range mappings {
		if !validFields[mappings[i].Field] {
			mappings[i].Field = "ignore"
		}
	}

	return &ColumnMappingResponse{Mappings: mappings}, nil
}

// heuristicMapping uses simple keyword matching as a fallback.
func (s *AIService) heuristicMapping(headers []string) *ColumnMappingResponse {
	mappings := make([]FieldMapping, len(headers))
	for i, h := range headers {
		mappings[i] = FieldMapping{
			Header: h,
			Field:  matchField(h),
		}
	}
	return &ColumnMappingResponse{Mappings: mappings}
}

func matchField(header string) string {
	h := strings.ToLower(strings.TrimSpace(header))

	nameKeywords := []string{"nombre", "name", "apellido", "estudiante", "alumno"}
	emailKeywords := []string{"email", "correo", "e-mail", "mail"}
	cedulaKeywords := []string{"cedula", "cédula", "ci", "identificacion", "identificación", "documento", "dni"}
	phoneKeywords := []string{"telefono", "teléfono", "celular", "phone", "movil", "móvil"}

	for _, k := range emailKeywords {
		if strings.Contains(h, k) {
			return "email"
		}
	}
	for _, k := range cedulaKeywords {
		if strings.Contains(h, k) {
			return "cedula"
		}
	}
	for _, k := range phoneKeywords {
		if strings.Contains(h, k) {
			return "phone"
		}
	}
	for _, k := range nameKeywords {
		if strings.Contains(h, k) {
			return "display_name"
		}
	}
	return "ignore"
}
