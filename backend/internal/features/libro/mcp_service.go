package libro

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type mcpContextBundle struct {
	PromptContext string
	ToolCalls     []MCPToolCall
}

type mcpOrchestrator struct {
	repo *Repository
}

func newMCPOrchestrator(repo *Repository) *mcpOrchestrator {
	return &mcpOrchestrator{repo: repo}
}

func (m *mcpOrchestrator) BuildChatContext(ctx context.Context, recursoID string, userPrompt string) (*mcpContextBundle, error) {
	if strings.TrimSpace(recursoID) == "" {
		return nil, fmt.Errorf("recurso_id es requerido")
	}

	bundle := &mcpContextBundle{ToolCalls: make([]MCPToolCall, 0, 4)}

	detail, call, err := m.toolGetLibroOverview(ctx, recursoID)
	if err != nil {
		return nil, err
	}
	bundle.ToolCalls = append(bundle.ToolCalls, call)

	views, viewsCall, err := m.toolGetResourceViews(ctx, recursoID)
	if err != nil {
		return nil, err
	}
	bundle.ToolCalls = append(bundle.ToolCalls, viewsCall)

	preguntas, searchCall, err := m.toolSearchPreguntas(ctx, recursoID, userPrompt)
	if err != nil {
		return nil, err
	}
	bundle.ToolCalls = append(bundle.ToolCalls, searchCall)

	contenidoPaginas, contentCall, err := m.toolSearchContenidoPaginas(ctx, recursoID, userPrompt)
	if err != nil {
		return nil, err
	}
	bundle.ToolCalls = append(bundle.ToolCalls, contentCall)

	var sb strings.Builder
	sb.WriteString("CONTEXTO MCP DEL LIBRO\n")
	sb.WriteString(fmt.Sprintf("- recurso_id: %s\n", detail.ID))
	sb.WriteString(fmt.Sprintf("- titulo: %s\n", detail.Titulo))
	sb.WriteString(fmt.Sprintf("- idioma: %s\n", detail.Idioma))
	sb.WriteString(fmt.Sprintf("- estado: %s\n", detail.Estado))
	sb.WriteString(fmt.Sprintf("- preguntas_totales: %d\n", detail.PreguntasTotales))
	sb.WriteString(fmt.Sprintf("- vistas_recurso_total: %d\n", views.VistasTotal))
	sb.WriteString(fmt.Sprintf("- usuarios_vistas_total: %d\n", views.UsuariosUnicos))
	if views.UltimaVistaAt != nil {
		sb.WriteString(fmt.Sprintf("- ultima_vista_recurso_at: %s\n", views.UltimaVistaAt.Format(time.RFC3339)))
	}
	if detail.PaginasTotales != nil {
		sb.WriteString(fmt.Sprintf("- paginas_totales: %d\n", *detail.PaginasTotales))
	}
	if detail.Descripcion != nil && strings.TrimSpace(*detail.Descripcion) != "" {
		sb.WriteString(fmt.Sprintf("- descripcion: %s\n", strings.TrimSpace(*detail.Descripcion)))
	}

	sb.WriteString("\nPREGUNTAS RELEVANTES\n")
	for idx, p := range preguntas {
		if idx >= 12 {
			break
		}
		page := "?"
		if p.PaginaLibro != nil {
			page = fmt.Sprintf("%d", *p.PaginaLibro)
		}
		sb.WriteString(fmt.Sprintf("%d) [pag %s] %s\n", idx+1, page, strings.TrimSpace(p.Texto)))
	}

	sb.WriteString("\nCONTENIDO RELEVANTE DEL LIBRO\n")
	for idx, page := range contenidoPaginas {
		if idx >= 8 {
			break
		}
		content := strings.TrimSpace(page.Contenido)
		if len(content) > 900 {
			content = content[:900] + "..."
		}
		sb.WriteString(fmt.Sprintf("%d) [pag %d] %s\n", idx+1, page.Pagina, content))
	}

	bundle.PromptContext = sb.String()
	return bundle, nil
}

func (m *mcpOrchestrator) toolGetLibroOverview(ctx context.Context, recursoID string) (*LibroRecursoDetailResponse, MCPToolCall, error) {
	started := time.Now()
	input := map[string]interface{}{"recurso_id": recursoID}

	detail, err := m.repo.GetLibroRecursoDetail(ctx, recursoID)
	if err != nil {
		return nil, MCPToolCall{}, err
	}

	output := fmt.Sprintf("titulo=%s, idioma=%s, preguntas=%d", detail.Titulo, detail.Idioma, detail.PreguntasTotales)
	return detail, MCPToolCall{
		Name:          "libro.get_overview",
		Input:         mustJSON(input),
		OutputSummary: output,
		DurationMs:    time.Since(started).Milliseconds(),
	}, nil
}

func (m *mcpOrchestrator) toolGetResourceViews(ctx context.Context, recursoID string) (*LibroRecursoViewsSummary, MCPToolCall, error) {
	started := time.Now()
	input := map[string]interface{}{"recurso_id": recursoID}

	summary, err := m.repo.GetLibroRecursoViewsSummary(ctx, recursoID)
	if err != nil {
		return nil, MCPToolCall{}, err
	}

	output := fmt.Sprintf("vistas=%d, usuarios_unicos=%d", summary.VistasTotal, summary.UsuariosUnicos)
	return summary, MCPToolCall{
		Name:          "libro.get_resource_views",
		Input:         mustJSON(input),
		OutputSummary: output,
		DurationMs:    time.Since(started).Milliseconds(),
	}, nil
}

func (m *mcpOrchestrator) toolSearchPreguntas(ctx context.Context, recursoID string, prompt string) ([]TrabajoPregunta, MCPToolCall, error) {
	started := time.Now()
	trimmed := strings.TrimSpace(prompt)
	input := map[string]interface{}{
		"recurso_id": recursoID,
		"query":      trimmed,
		"limit":      12,
	}

	items, err := m.repo.SearchPreguntasContextByLibroRecurso(ctx, recursoID, trimmed, 12)
	if err != nil {
		return nil, MCPToolCall{}, err
	}

	output := fmt.Sprintf("preguntas_encontradas=%d", len(items))
	return items, MCPToolCall{
		Name:          "libro.search_questions",
		Input:         mustJSON(input),
		OutputSummary: output,
		DurationMs:    time.Since(started).Milliseconds(),
	}, nil
}

func (m *mcpOrchestrator) toolSearchContenidoPaginas(ctx context.Context, recursoID string, prompt string) ([]LibroContenidoPagina, MCPToolCall, error) {
	started := time.Now()
	trimmed := strings.TrimSpace(prompt)
	input := map[string]interface{}{
		"recurso_id": recursoID,
		"query":      trimmed,
		"limit":      8,
	}

	items, err := m.repo.SearchLibroContenidoPaginas(ctx, recursoID, trimmed, 8)
	if err != nil {
		return nil, MCPToolCall{}, err
	}

	output := fmt.Sprintf("paginas_encontradas=%d", len(items))
	return items, MCPToolCall{
		Name:          "libro.search_content_pages",
		Input:         mustJSON(input),
		OutputSummary: output,
		DurationMs:    time.Since(started).Milliseconds(),
	}, nil
}

func mustJSON(v interface{}) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("{}")
	}
	return b
}
