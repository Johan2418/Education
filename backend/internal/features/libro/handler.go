package libro

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/arcanea/backend/internal/middleware"
	"github.com/arcanea/backend/internal/shared"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) GetEstado(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	resp, err := h.svc.GetEstado(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) ExtractLibro(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req ExtractLibroRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos invalidos")
		return
	}
	resp, err := h.svc.ExtractLibro(r.Context(), chi.URLParam(r, "trabajoId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) StartExtractLibroAsync(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req ExtractLibroRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos invalidos")
		return
	}
	resp, err := h.svc.StartExtractLibroAsync(r.Context(), chi.URLParam(r, "trabajoId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) GetExtractLibroJobStatus(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	resp, err := h.svc.GetExtractLibroJob(
		r.Context(),
		chi.URLParam(r, "trabajoId"),
		chi.URLParam(r, "jobId"),
		claims.Subject,
		claims.UserRole,
	)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) RevisarLibro(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req RevisionLibroRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos invalidos")
		return
	}
	resp, err := h.svc.RevisarLibro(r.Context(), chi.URLParam(r, "trabajoId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) ConfirmarLibro(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req ConfirmarLibroRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos invalidos")
		return
	}
	resp, err := h.svc.ConfirmarLibro(r.Context(), chi.URLParam(r, "trabajoId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) GetObservability(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	resp, err := h.svc.GetObservability(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) ListLibroRecursos(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	query := r.URL.Query()

	var estado *EstadoLibroRecurso
	if rawEstado := strings.TrimSpace(query.Get("estado")); rawEstado != "" {
		parsed := EstadoLibroRecurso(rawEstado)
		estado = &parsed
	}

	var esPublico *bool
	if rawPublico := strings.TrimSpace(query.Get("es_publico")); rawPublico != "" {
		parsed, err := strconv.ParseBool(rawPublico)
		if err != nil {
			shared.Error(w, http.StatusBadRequest, "es_publico invalido")
			return
		}
		esPublico = &parsed
	}

	page := 1
	if rawPage := strings.TrimSpace(query.Get("page")); rawPage != "" {
		parsed, err := strconv.Atoi(rawPage)
		if err != nil || parsed < 1 {
			shared.Error(w, http.StatusBadRequest, "page invalido")
			return
		}
		page = parsed
	}

	pageSize := 20
	if rawPageSize := strings.TrimSpace(query.Get("page_size")); rawPageSize != "" {
		parsed, err := strconv.Atoi(rawPageSize)
		if err != nil || parsed < 1 {
			shared.Error(w, http.StatusBadRequest, "page_size invalido")
			return
		}
		pageSize = parsed
	}

	resp, err := h.svc.ListLibroRecursos(r.Context(), LibroRecursoListQuery{
		Search:    strings.TrimSpace(query.Get("q")),
		Estado:    estado,
		EsPublico: esPublico,
		Page:      page,
		PageSize:  pageSize,
	}, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) GetLibroRecursoDetalle(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	resp, err := h.svc.GetLibroRecursoDetail(r.Context(), chi.URLParam(r, "recursoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) GetLibroRecursoPagina(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())

	pagina, err := strconv.Atoi(strings.TrimSpace(chi.URLParam(r, "pagina")))
	if err != nil {
		shared.Error(w, http.StatusBadRequest, "pagina invalida")
		return
	}

	resp, err := h.svc.GetLibroRecursoPagina(r.Context(), chi.URLParam(r, "recursoId"), pagina, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) CreateLibroChatSession(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req CreateLibroChatSessionRequest
	if r.ContentLength > 0 {
		if err := shared.Decode(r, &req); err != nil {
			shared.Error(w, http.StatusBadRequest, "Datos invalidos")
			return
		}
	}

	resp, err := h.svc.CreateLibroChatSession(r.Context(), chi.URLParam(r, "recursoId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) ListLibroChatSessions(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	query := r.URL.Query()

	limit := 20
	if raw := strings.TrimSpace(query.Get("limit")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 {
			shared.Error(w, http.StatusBadRequest, "limit invalido")
			return
		}
		limit = v
	}

	offset := 0
	if raw := strings.TrimSpace(query.Get("offset")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 0 {
			shared.Error(w, http.StatusBadRequest, "offset invalido")
			return
		}
		offset = v
	}

	resp, err := h.svc.ListLibroChatSessions(r.Context(), chi.URLParam(r, "recursoId"), claims.Subject, claims.UserRole, limit, offset)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) GetLibroChatMessages(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	query := r.URL.Query()

	limit := 100
	if raw := strings.TrimSpace(query.Get("limit")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 {
			shared.Error(w, http.StatusBadRequest, "limit invalido")
			return
		}
		limit = v
	}

	resp, err := h.svc.GetLibroChatMessages(
		r.Context(),
		chi.URLParam(r, "recursoId"),
		chi.URLParam(r, "sesionId"),
		claims.Subject,
		claims.UserRole,
		limit,
	)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) SendLibroChatMessage(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req LibroChatSendMessageRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos invalidos")
		return
	}

	resp, err := h.svc.SendLibroChatMessage(
		r.Context(),
		chi.URLParam(r, "recursoId"),
		chi.URLParam(r, "sesionId"),
		req,
		claims.Subject,
		claims.UserRole,
	)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}

func (h *Handler) GetLibroChatReporte(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	query := r.URL.Query()

	limit := 5
	if raw := strings.TrimSpace(query.Get("top_tools_limit")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 {
			shared.Error(w, http.StatusBadRequest, "top_tools_limit invalido")
			return
		}
		limit = v
	}

	resp, err := h.svc.GetLibroChatReporte(
		r.Context(),
		chi.URLParam(r, "recursoId"),
		claims.Subject,
		claims.UserRole,
		limit,
	)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, resp)
}
