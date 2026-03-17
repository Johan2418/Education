package trabajos

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/xuri/excelize/v2"

	"github.com/arcanea/backend/internal/middleware"
	"github.com/arcanea/backend/internal/shared"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) CreateTrabajo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req CreateTrabajoRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CreateTrabajo(r.Context(), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Created(w, item)
}

func (h *Handler) ListTrabajosByLeccion(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	items, err := h.svc.ListTrabajosByLeccion(r.Context(), chi.URLParam(r, "leccionId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) PublicarTrabajo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	item, err := h.svc.PublicarTrabajo(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) CerrarTrabajo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	item, err := h.svc.CerrarTrabajo(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) UpdateTrabajo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req UpdateTrabajoRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpdateTrabajo(r.Context(), chi.URLParam(r, "trabajoId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) DeleteTrabajo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	if err := h.svc.DeleteTrabajo(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole); err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.MessageOK(w, "trabajo eliminado")
}

func (h *Handler) GetTrabajo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	item, err := h.svc.GetTrabajo(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) ListMisTrabajos(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	items, err := h.svc.ListMisTrabajos(r.Context(), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}
	shared.Success(w, items)
}

func (h *Handler) UpsertEntrega(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req CreateEntregaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpsertEntrega(r.Context(), chi.URLParam(r, "trabajoId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) GetMiEntrega(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	item, err := h.svc.GetMiEntrega(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) GetTrabajoFormulario(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	item, err := h.svc.GetTrabajoFormulario(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) UpdateEntregaByID(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req CreateEntregaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.UpdateEntregaByID(r.Context(), chi.URLParam(r, "entregaId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) ListEntregasByTrabajo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	query := r.URL.Query()
	limit := 0
	offset := 0

	if rawLimit := query.Get("limit"); rawLimit != "" {
		parsedLimit, err := strconv.Atoi(rawLimit)
		if err != nil || parsedLimit < 0 {
			shared.Error(w, http.StatusBadRequest, "limit invalido")
			return
		}
		if parsedLimit > 100 {
			parsedLimit = 100
		}
		limit = parsedLimit
	}

	if rawOffset := query.Get("offset"); rawOffset != "" {
		parsedOffset, err := strconv.Atoi(rawOffset)
		if err != nil || parsedOffset < 0 {
			shared.Error(w, http.StatusBadRequest, "offset invalido")
			return
		}
		offset = parsedOffset
	}

	items, total, err := h.svc.ListEntregasByTrabajo(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole, limit, offset)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}

	if query.Has("limit") || query.Has("offset") {
		effectiveLimit := limit
		if effectiveLimit <= 0 {
			effectiveLimit = len(items)
		}
		response := PaginatedEntregasResponse{
			Items:   items,
			Total:   total,
			Limit:   effectiveLimit,
			Offset:  offset,
			HasNext: int64(offset+len(items)) < total,
		}
		shared.Success(w, response)
		return
	}

	shared.Success(w, items)
}

func (h *Handler) GetTrabajoReporte(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	item, err := h.svc.GetTrabajoReporte(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) GetTrabajoNotificaciones(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	item, err := h.svc.GetTrabajoNotificaciones(r.Context(), chi.URLParam(r, "trabajoId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) GetTrabajoAnalyticsV2(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	query := r.URL.Query()

	filter := TrabajoAnalyticsFilter{}

	if cursoID := query.Get("curso_id"); cursoID != "" {
		filter.CursoID = &cursoID
	}
	if leccionID := query.Get("leccion_id"); leccionID != "" {
		filter.LeccionID = &leccionID
	}
	if estudianteID := query.Get("estudiante_id"); estudianteID != "" {
		filter.EstudianteID = &estudianteID
	}

	if rawFrom := query.Get("from"); rawFrom != "" {
		from, err := parseAnalyticsDate(rawFrom, false)
		if err != nil {
			shared.Error(w, http.StatusBadRequest, "from invalido. Usa RFC3339 o YYYY-MM-DD")
			return
		}
		filter.From = &from
	}

	if rawTo := query.Get("to"); rawTo != "" {
		to, err := parseAnalyticsDate(rawTo, true)
		if err != nil {
			shared.Error(w, http.StatusBadRequest, "to invalido. Usa RFC3339 o YYYY-MM-DD")
			return
		}
		filter.To = &to
	}

	item, err := h.svc.GetTrabajoAnalyticsV2(r.Context(), filter, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) ExportEntregasCSV(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	trabajoID := chi.URLParam(r, "trabajoId")
	items, err := h.svc.ExportEntregasCSV(r.Context(), trabajoID, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=trabajo_"+trabajoID+"_entregas.csv")

	cw := csv.NewWriter(w)
	defer cw.Flush()

	if err := cw.Write([]string{
		"entrega_id",
		"estudiante_id",
		"estudiante_nombre",
		"estudiante_email",
		"estado_entrega",
		"puntaje",
		"feedback",
		"submitted_at",
		"comentario",
		"archivo_url",
		"respuestas_json",
		"sugerencia_ia_json",
	}); err != nil {
		shared.Error(w, http.StatusInternalServerError, "error al escribir CSV")
		return
	}

	for _, item := range items {
		puntaje := ""
		feedback := ""
		sugerenciaIA := ""
		if item.Calificacion != nil {
			puntaje = strconv.FormatFloat(item.Calificacion.Puntaje, 'f', 2, 64)
			if item.Calificacion.Feedback != nil {
				feedback = *item.Calificacion.Feedback
			}
			if len(item.Calificacion.SugerenciaIA) > 0 {
				sugerenciaIA = string(item.Calificacion.SugerenciaIA)
			}
		}

		respuestas := "{}"
		if len(item.Entrega.Respuestas) > 0 {
			respuestas = string(item.Entrega.Respuestas)
		}

		comentario := ""
		if item.Entrega.Comentario != nil {
			comentario = *item.Entrega.Comentario
		}

		archivoURL := ""
		if item.Entrega.ArchivoURL != nil {
			archivoURL = *item.Entrega.ArchivoURL
		}

		nombre := ""
		if item.EstudianteNombre != nil {
			nombre = *item.EstudianteNombre
		}

		email := ""
		if item.EstudianteEmail != nil {
			email = *item.EstudianteEmail
		}

		if !json.Valid([]byte(respuestas)) {
			respuestas = "{}"
		}
		if sugerenciaIA != "" && !json.Valid([]byte(sugerenciaIA)) {
			sugerenciaIA = "{}"
		}

		if err := cw.Write([]string{
			item.Entrega.ID,
			item.Entrega.EstudianteID,
			nombre,
			email,
			item.Entrega.Estado,
			puntaje,
			feedback,
			item.Entrega.SubmittedAt.Format(time.RFC3339),
			comentario,
			archivoURL,
			respuestas,
			sugerenciaIA,
		}); err != nil {
			shared.Error(w, http.StatusInternalServerError, "error al escribir fila CSV")
			return
		}
	}
}

func parseAnalyticsDate(raw string, endOfDay bool) (time.Time, error) {
	if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
		return parsed, nil
	}

	parsed, err := time.Parse("2006-01-02", raw)
	if err != nil {
		return time.Time{}, err
	}

	if endOfDay {
		return parsed.Add(24*time.Hour - time.Nanosecond), nil
	}

	return parsed, nil
}

func (h *Handler) ExportEntregasXLSX(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	trabajoID := chi.URLParam(r, "trabajoId")
	items, err := h.svc.ExportEntregasCSV(r.Context(), trabajoID, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusForbidden, err.Error())
		return
	}

	f := excelize.NewFile()
	sheet := "Entregas"
	f.SetSheetName("Sheet1", sheet)

	headers := []string{
		"entrega_id",
		"estudiante_id",
		"estudiante_nombre",
		"estudiante_email",
		"estado_entrega",
		"puntaje",
		"feedback",
		"submitted_at",
		"comentario",
		"archivo_url",
		"respuestas_json",
		"sugerencia_ia_json",
	}
	for i, header := range headers {
		col, _ := excelize.ColumnNumberToName(i + 1)
		_ = f.SetCellValue(sheet, col+"1", header)
	}

	for idx, item := range items {
		puntaje := ""
		feedback := ""
		sugerenciaIA := ""
		if item.Calificacion != nil {
			puntaje = strconv.FormatFloat(item.Calificacion.Puntaje, 'f', 2, 64)
			if item.Calificacion.Feedback != nil {
				feedback = *item.Calificacion.Feedback
			}
			if len(item.Calificacion.SugerenciaIA) > 0 {
				sugerenciaIA = string(item.Calificacion.SugerenciaIA)
			}
		}

		respuestas := "{}"
		if len(item.Entrega.Respuestas) > 0 {
			respuestas = string(item.Entrega.Respuestas)
		}

		comentario := ""
		if item.Entrega.Comentario != nil {
			comentario = *item.Entrega.Comentario
		}

		archivoURL := ""
		if item.Entrega.ArchivoURL != nil {
			archivoURL = *item.Entrega.ArchivoURL
		}

		nombre := ""
		if item.EstudianteNombre != nil {
			nombre = *item.EstudianteNombre
		}

		email := ""
		if item.EstudianteEmail != nil {
			email = *item.EstudianteEmail
		}

		row := []string{
			item.Entrega.ID,
			item.Entrega.EstudianteID,
			nombre,
			email,
			item.Entrega.Estado,
			puntaje,
			feedback,
			item.Entrega.SubmittedAt.Format(time.RFC3339),
			comentario,
			archivoURL,
			respuestas,
			sugerenciaIA,
		}

		for colIdx, value := range row {
			col, _ := excelize.ColumnNumberToName(colIdx + 1)
			cell := col + strconv.Itoa(idx+2)
			_ = f.SetCellValue(sheet, cell, value)
		}
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		shared.Error(w, http.StatusInternalServerError, "error al generar XLSX")
		return
	}

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", "attachment; filename=trabajo_"+trabajoID+"_entregas.xlsx")
	w.Header().Set("Content-Length", strconv.Itoa(buf.Len()))
	_, _ = bytes.NewReader(buf.Bytes()).WriteTo(w)
}

func (h *Handler) CalificarEntrega(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req CalificarEntregaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CalificarEntrega(r.Context(), chi.URLParam(r, "entregaId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) GetEntregaDetalle(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	item, err := h.svc.GetEntregaDetalle(r.Context(), chi.URLParam(r, "entregaId"), claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}

func (h *Handler) CalificarEntregaPorPregunta(w http.ResponseWriter, r *http.Request) {
	claims := middleware.GetClaims(r.Context())
	var req CalificarEntregaPorPreguntaRequest
	if err := shared.Decode(r, &req); err != nil {
		shared.Error(w, http.StatusBadRequest, "Datos inválidos")
		return
	}
	item, err := h.svc.CalificarEntregaPorPregunta(r.Context(), chi.URLParam(r, "entregaId"), req, claims.Subject, claims.UserRole)
	if err != nil {
		shared.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	shared.Success(w, item)
}
