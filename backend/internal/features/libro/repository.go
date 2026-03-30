package libro

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) IsTeacherOfTrabajo(ctx context.Context, teacherID, trabajoID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Table("internal.trabajo tr").
		Joins("JOIN internal.leccion l ON l.id = tr.leccion_id").
		Joins("JOIN internal.tema t ON t.id = l.tema_id").
		Joins("JOIN internal.unidad u ON u.id = t.unidad_id").
		Joins("JOIN internal.materia m ON m.id = u.materia_id").
		Joins("JOIN internal.curso c ON c.id = m.curso_id").
		Where("tr.id = ? AND c.teacher_id = ?", trabajoID, teacherID).
		Count(&count).Error
	return count > 0, err
}

func (r *Repository) GetTrabajo(ctx context.Context, trabajoID string) (*Trabajo, error) {
	var t Trabajo
	if err := r.db.WithContext(ctx).Where("id = ?", trabajoID).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) GetExtraccionByTrabajo(ctx context.Context, trabajoID string) (*LibroExtraccion, error) {
	var e LibroExtraccion
	err := r.db.WithContext(ctx).Where("trabajo_id = ?", trabajoID).First(&e).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &e, nil
}

func (r *Repository) UpsertExtraccion(ctx context.Context, ext LibroExtraccion) (*LibroExtraccion, error) {
	err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "trabajo_id"}},
			DoUpdates: clause.Assignments(map[string]interface{}{
				"libro_recurso_id":     ext.LibroRecursoID,
				"archivo_url":          ext.ArchivoURL,
				"idioma":               ext.Idioma,
				"pagina_inicio":        ext.PaginaInicio,
				"pagina_fin":           ext.PaginaFin,
				"estado":               gorm.Expr("?::internal.estado_extraccion_libro", string(ext.Estado)),
				"preguntas_detectadas": ext.PreguntasDetectadas,
				"confianza_promedio":   ext.ConfianzaPromedio,
				"notas_extraccion":     ext.NotasExtraccion,
				"notas_revision":       ext.NotasRevision,
				"usado_fallback":       ext.UsadoFallback,
				"revisado_por":         ext.RevisadoPor,
				"confirmado_por":       ext.ConfirmadoPor,
			}),
		}).
		Create(&ext).Error
	if err != nil {
		return nil, err
	}
	return r.GetExtraccionByTrabajo(ctx, ext.TrabajoID)
}

func (r *Repository) ReplacePreguntas(ctx context.Context, trabajoID string, preguntas []TrabajoPregunta) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("trabajo_id = ?", trabajoID).Delete(&TrabajoPregunta{}).Error; err != nil {
			return err
		}
		for i := range preguntas {
			preguntas[i].TrabajoID = trabajoID
			if preguntas[i].Orden <= 0 {
				preguntas[i].Orden = i + 1
			}
			if len(preguntas[i].Opciones) == 0 {
				preguntas[i].Opciones = []byte("[]")
			}
			if err := tx.Create(&preguntas[i]).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *Repository) ListPreguntasByTrabajo(ctx context.Context, trabajoID string) ([]TrabajoPregunta, error) {
	var items []TrabajoPregunta
	err := r.db.WithContext(ctx).
		Where("trabajo_id = ?", trabajoID).
		Order("orden ASC, created_at ASC").
		Find(&items).Error
	return items, err
}

func (r *Repository) UpdateTrabajoPostExtraccion(ctx context.Context, trabajoID, extraccionID string) error {
	return r.db.WithContext(ctx).
		Model(&Trabajo{}).
		Where("id = ?", trabajoID).
		Updates(map[string]interface{}{
			"extraido_de_libro": true,
			"id_extraccion":     extraccionID,
		}).Error
}

func (r *Repository) UpdateTrabajoEstado(ctx context.Context, trabajoID, estado string) (*Trabajo, error) {
	if err := r.db.WithContext(ctx).
		Model(&Trabajo{}).
		Where("id = ?", trabajoID).
		Update("estado", gorm.Expr("?::internal.estado_trabajo", estado)).Error; err != nil {
		return nil, err
	}
	return r.GetTrabajo(ctx, trabajoID)
}

func (r *Repository) FindLibroRecursoByHashes(ctx context.Context, hashContenido string, hashArchivo *string, hashVersion string) (*LibroRecurso, error) {
	if hashVersion == "" {
		hashVersion = "v1"
	}

	if hashArchivo != nil && *hashArchivo != "" {
		var byFile LibroRecurso
		err := r.db.WithContext(ctx).
			Where("hash_archivo = ?", *hashArchivo).
			First(&byFile).Error
		if err == nil {
			return &byFile, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}

	if hashContenido == "" {
		return nil, nil
	}

	var byContent LibroRecurso
	err := r.db.WithContext(ctx).
		Where("hash_contenido = ? AND hash_version = ?", hashContenido, hashVersion).
		First(&byContent).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &byContent, nil
}

func (r *Repository) CreateLibroRecurso(ctx context.Context, recurso LibroRecurso) (*LibroRecurso, error) {
	err := r.db.WithContext(ctx).Create(&recurso).Error
	if err != nil {
		found, findErr := r.FindLibroRecursoByHashes(ctx, recurso.HashContenido, recurso.HashArchivo, recurso.HashVersion)
		if findErr == nil && found != nil {
			return found, nil
		}
		return nil, err
	}
	return &recurso, nil
}

func (r *Repository) UpdateLibroRecursoAfterExtract(ctx context.Context, recursoID string, estado EstadoLibroRecurso, paginasTotales *int, archivoURL *string) error {
	updates := map[string]interface{}{
		"estado": gorm.Expr("?::internal.estado_libro_recurso", string(estado)),
	}
	if paginasTotales != nil {
		updates["paginas_totales"] = *paginasTotales
	}
	if archivoURL != nil {
		updates["archivo_url"] = *archivoURL
	}
	return r.db.WithContext(ctx).
		Model(&LibroRecurso{}).
		Where("id = ?", recursoID).
		Updates(updates).Error
}

func (r *Repository) UpsertLibroContenidoPaginas(ctx context.Context, recursoID string, paginas []LibroContenidoPagina) error {
	if strings.TrimSpace(recursoID) == "" {
		return errors.New("libro_recurso_id es requerido")
	}

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("libro_recurso_id = ?", recursoID).Delete(&LibroContenidoPagina{}).Error; err != nil {
			return err
		}

		for i := range paginas {
			paginas[i].LibroRecursoID = recursoID
			if paginas[i].Pagina <= 0 || strings.TrimSpace(paginas[i].Contenido) == "" {
				continue
			}
			if len(paginas[i].Metadata) == 0 {
				paginas[i].Metadata = []byte("{}")
			}
			if err := tx.Create(&paginas[i]).Error; err != nil {
				return err
			}
		}

		return nil
	})
	if isUndefinedLibroContenidoPaginaTableError(err) {
		// Backward compatibility: allow extraction flow to continue when migration 018 is not yet applied.
		return nil
	}
	return err
}

func (r *Repository) GetLibroContenidoPagina(ctx context.Context, recursoID string, pagina int) (*LibroContenidoPagina, error) {
	if strings.TrimSpace(recursoID) == "" || pagina < 1 {
		return nil, nil
	}

	var item LibroContenidoPagina
	err := r.db.WithContext(ctx).
		Where("libro_recurso_id = ? AND pagina = ?", recursoID, pagina).
		First(&item).Error
	if err != nil {
		if isUndefinedLibroContenidoPaginaTableError(err) {
			return nil, nil
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &item, nil
}

func (r *Repository) ListLibroContenidoPaginas(ctx context.Context, recursoID string, limit int) ([]LibroContenidoPagina, error) {
	if limit <= 0 {
		limit = 8
	}
	if limit > 30 {
		limit = 30
	}

	var items []LibroContenidoPagina
	err := r.db.WithContext(ctx).
		Where("libro_recurso_id = ?", recursoID).
		Order("pagina ASC").
		Limit(limit).
		Find(&items).Error
	if err != nil {
		if isUndefinedLibroContenidoPaginaTableError(err) {
			return []LibroContenidoPagina{}, nil
		}
		return nil, err
	}

	return items, nil
}

func (r *Repository) SearchLibroContenidoPaginas(ctx context.Context, recursoID, query string, limit int) ([]LibroContenidoPagina, error) {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return r.ListLibroContenidoPaginas(ctx, recursoID, limit)
	}
	if limit <= 0 {
		limit = 6
	}
	if limit > 20 {
		limit = 20
	}

	terms := strings.Fields(strings.ToLower(trimmed))
	if len(terms) > 6 {
		terms = terms[:6]
	}

	whereLike := make([]string, 0, len(terms))
	args := make([]interface{}, 0, len(terms)+1)
	args = append(args, recursoID)
	for _, term := range terms {
		if len(term) < 3 {
			continue
		}
		whereLike = append(whereLike, "LOWER(contenido) LIKE ?")
		args = append(args, "%"+term+"%")
	}
	if len(whereLike) == 0 {
		return r.ListLibroContenidoPaginas(ctx, recursoID, limit)
	}

	querySQL := fmt.Sprintf("(%s)", strings.Join(whereLike, " OR "))

	var items []LibroContenidoPagina
	err := r.db.WithContext(ctx).
		Where("libro_recurso_id = ?", recursoID).
		Where(querySQL, args[1:]...).
		Order("pagina ASC").
		Limit(limit).
		Find(&items).Error
	if err != nil {
		if isUndefinedLibroContenidoPaginaTableError(err) {
			return []LibroContenidoPagina{}, nil
		}
		return nil, err
	}
	if len(items) > 0 {
		return items, nil
	}

	return r.ListLibroContenidoPaginas(ctx, recursoID, limit)
}

func isUndefinedLibroContenidoPaginaTableError(err error) bool {
	if err == nil {
		return false
	}

	var pqErr *pq.Error
	if errors.As(err, &pqErr) && string(pqErr.Code) == "42P01" {
		return true
	}

	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "libro_contenido_pagina") && strings.Contains(lower, "does not exist")
}

func (r *Repository) LinkTrabajoLibroRecurso(ctx context.Context, trabajoID, libroRecursoID, createdBy string) error {
	row := TrabajoLibroRecurso{
		TrabajoID:      trabajoID,
		LibroRecursoID: libroRecursoID,
		CreatedBy:      &createdBy,
	}
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "trabajo_id"}},
			DoUpdates: clause.Assignments(map[string]interface{}{"libro_recurso_id": libroRecursoID, "created_by": createdBy}),
		}).
		Create(&row).Error
}

func (r *Repository) ListPreguntasByLibroRecurso(ctx context.Context, libroRecursoID string) ([]TrabajoPregunta, error) {
	var link TrabajoLibroRecurso
	err := r.db.WithContext(ctx).
		Where("libro_recurso_id = ?", libroRecursoID).
		Order("created_at ASC").
		First(&link).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return []TrabajoPregunta{}, nil
		}
		return nil, err
	}

	return r.ListPreguntasByTrabajo(ctx, link.TrabajoID)
}

func (r *Repository) ListLibroRecursos(ctx context.Context, q LibroRecursoListQuery) ([]LibroRecursoListItem, int64, error) {
	type row struct {
		ID               string             `gorm:"column:id"`
		Titulo           string             `gorm:"column:titulo"`
		Descripcion      *string            `gorm:"column:descripcion"`
		Idioma           string             `gorm:"column:idioma"`
		PaginasTotales   *int               `gorm:"column:paginas_totales"`
		Estado           EstadoLibroRecurso `gorm:"column:estado"`
		EsPublico        bool               `gorm:"column:es_publico"`
		PreguntasTotales int64              `gorm:"column:preguntas_totales"`
		CreatedAt        int64              `gorm:"column:created_at_unix"`
		UpdatedAt        int64              `gorm:"column:updated_at_unix"`
	}

	query := r.db.WithContext(ctx).
		Table("internal.libro_recurso lr").
		Select(`
			lr.id,
			lr.titulo,
			lr.descripcion,
			lr.idioma,
			lr.paginas_totales,
			lr.estado,
			lr.es_publico,
			COALESCE(SUM(tp_count.cnt), 0) AS preguntas_totales,
			EXTRACT(EPOCH FROM lr.created_at)::bigint AS created_at_unix,
			EXTRACT(EPOCH FROM lr.updated_at)::bigint AS updated_at_unix
		`).
		Joins(`
			LEFT JOIN internal.trabajo_libro_recurso tlr ON tlr.libro_recurso_id = lr.id
		`).
		Joins(`
			LEFT JOIN LATERAL (
				SELECT COUNT(*)::bigint AS cnt
				FROM internal.trabajo_pregunta tp
				WHERE tp.trabajo_id = tlr.trabajo_id
			) tp_count ON TRUE
		`).
		Group("lr.id")

	if trimmed := strings.TrimSpace(q.Search); trimmed != "" {
		query = query.Where("lr.titulo ILIKE ?", "%"+trimmed+"%")
	}
	if q.Estado != nil {
		query = query.Where("lr.estado = ?::internal.estado_libro_recurso", string(*q.Estado))
	}
	if q.EsPublico != nil {
		query = query.Where("lr.es_publico = ?", *q.EsPublico)
	}

	countQuery := r.db.WithContext(ctx).Table("internal.libro_recurso lr")
	if trimmed := strings.TrimSpace(q.Search); trimmed != "" {
		countQuery = countQuery.Where("lr.titulo ILIKE ?", "%"+trimmed+"%")
	}
	if q.Estado != nil {
		countQuery = countQuery.Where("lr.estado = ?::internal.estado_libro_recurso", string(*q.Estado))
	}
	if q.EsPublico != nil {
		countQuery = countQuery.Where("lr.es_publico = ?", *q.EsPublico)
	}

	var total int64
	if err := countQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 {
		q.PageSize = 20
	}
	offset := (q.Page - 1) * q.PageSize

	var rows []row
	err := query.Order("lr.updated_at DESC").Limit(q.PageSize).Offset(offset).Scan(&rows).Error
	if err != nil {
		return nil, 0, err
	}

	items := make([]LibroRecursoListItem, 0, len(rows))
	for _, it := range rows {
		items = append(items, LibroRecursoListItem{
			ID:               it.ID,
			Titulo:           it.Titulo,
			Descripcion:      it.Descripcion,
			Idioma:           it.Idioma,
			PaginasTotales:   it.PaginasTotales,
			Estado:           it.Estado,
			EsPublico:        it.EsPublico,
			PreguntasTotales: it.PreguntasTotales,
			CreatedAt:        fromUnix(it.CreatedAt),
			UpdatedAt:        fromUnix(it.UpdatedAt),
		})
	}

	return items, total, nil
}

func (r *Repository) GetLibroRecursoDetail(ctx context.Context, recursoID string) (*LibroRecursoDetailResponse, error) {
	type row struct {
		ID                string             `gorm:"column:id"`
		Titulo            string             `gorm:"column:titulo"`
		Descripcion       *string            `gorm:"column:descripcion"`
		Idioma            string             `gorm:"column:idioma"`
		PaginasTotales    *int               `gorm:"column:paginas_totales"`
		Estado            EstadoLibroRecurso `gorm:"column:estado"`
		EsPublico         bool               `gorm:"column:es_publico"`
		PreguntasTotales  int64              `gorm:"column:preguntas_totales"`
		PaginasDetectadas int64              `gorm:"column:paginas_detectadas"`
		CreatedAt         int64              `gorm:"column:created_at_unix"`
		UpdatedAt         int64              `gorm:"column:updated_at_unix"`
	}

	var out row
	err := r.db.WithContext(ctx).
		Table("internal.libro_recurso lr").
		Select(`
			lr.id,
			lr.titulo,
			lr.descripcion,
			lr.idioma,
			lr.paginas_totales,
			lr.estado,
			lr.es_publico,
			COALESCE(COUNT(tp.id), 0)::bigint AS preguntas_totales,
			COALESCE(COUNT(DISTINCT tp.pagina_libro), 0)::bigint AS paginas_detectadas,
			EXTRACT(EPOCH FROM lr.created_at)::bigint AS created_at_unix,
			EXTRACT(EPOCH FROM lr.updated_at)::bigint AS updated_at_unix
		`).
		Joins("LEFT JOIN internal.trabajo_libro_recurso tlr ON tlr.libro_recurso_id = lr.id").
		Joins("LEFT JOIN internal.trabajo_pregunta tp ON tp.trabajo_id = tlr.trabajo_id").
		Where("lr.id = ?", recursoID).
		Group("lr.id").
		Scan(&out).Error
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(out.ID) == "" {
		return nil, gorm.ErrRecordNotFound
	}

	return &LibroRecursoDetailResponse{
		ID:                out.ID,
		Titulo:            out.Titulo,
		Descripcion:       out.Descripcion,
		Idioma:            out.Idioma,
		PaginasTotales:    out.PaginasTotales,
		Estado:            out.Estado,
		EsPublico:         out.EsPublico,
		PreguntasTotales:  out.PreguntasTotales,
		PaginasDetectadas: out.PaginasDetectadas,
		CreatedAt:         fromUnix(out.CreatedAt),
		UpdatedAt:         fromUnix(out.UpdatedAt),
	}, nil
}

func (r *Repository) ListPreguntasByLibroRecursoAndPagina(ctx context.Context, libroRecursoID string, pagina int) ([]TrabajoPregunta, error) {
	if pagina < 1 {
		return []TrabajoPregunta{}, nil
	}

	var items []TrabajoPregunta
	err := r.db.WithContext(ctx).
		Table("internal.trabajo_pregunta").
		Joins("JOIN internal.trabajo_libro_recurso tlr ON tlr.trabajo_id = internal.trabajo_pregunta.trabajo_id").
		Where("tlr.libro_recurso_id = ? AND internal.trabajo_pregunta.pagina_libro = ?", libroRecursoID, pagina).
		Order("internal.trabajo_pregunta.orden ASC, internal.trabajo_pregunta.created_at ASC").
		Find(&items).Error
	if err != nil {
		return nil, err
	}
	return items, nil
}

func fromUnix(ts int64) time.Time {
	if ts <= 0 {
		return time.Time{}
	}
	return time.Unix(ts, 0).UTC()
}

func (r *Repository) CreateLibroChatSession(ctx context.Context, session LibroChatSession) (*LibroChatSession, error) {
	if strings.TrimSpace(session.LibroRecursoID) == "" {
		return nil, errors.New("libro_recurso_id es requerido")
	}
	if err := r.db.WithContext(ctx).Create(&session).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *Repository) ListLibroChatSessions(ctx context.Context, recursoID string, limit, offset int) ([]LibroChatSession, int64, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	query := r.db.WithContext(ctx).Model(&LibroChatSession{}).Where("libro_recurso_id = ?", recursoID)

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var items []LibroChatSession
	err := query.Order("COALESCE(last_message_at, created_at) DESC").Limit(limit).Offset(offset).Find(&items).Error
	if err != nil {
		return nil, 0, err
	}

	return items, total, nil
}

func (r *Repository) GetLibroChatSession(ctx context.Context, recursoID, sessionID string) (*LibroChatSession, error) {
	var item LibroChatSession
	err := r.db.WithContext(ctx).
		Where("id = ? AND libro_recurso_id = ?", sessionID, recursoID).
		First(&item).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &item, nil
}

func (r *Repository) TouchLibroChatSession(ctx context.Context, sessionID string, at time.Time) error {
	return r.db.WithContext(ctx).
		Model(&LibroChatSession{}).
		Where("id = ?", sessionID).
		Updates(map[string]interface{}{"last_message_at": at, "updated_at": at}).Error
}

func (r *Repository) CreateLibroChatMessage(ctx context.Context, msg LibroChatMessage) (*LibroChatMessage, error) {
	if strings.TrimSpace(msg.SessionID) == "" {
		return nil, errors.New("session_id es requerido")
	}
	if strings.TrimSpace(msg.Content) == "" {
		return nil, errors.New("content es requerido")
	}
	if len(msg.Metadata) == 0 {
		msg.Metadata = []byte("{}")
	}
	if err := r.db.WithContext(ctx).Create(&msg).Error; err != nil {
		return nil, err
	}
	return &msg, nil
}

func (r *Repository) ListLibroChatMessages(ctx context.Context, sessionID string, limit int) ([]LibroChatMessage, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}

	var desc []LibroChatMessage
	err := r.db.WithContext(ctx).
		Where("session_id = ?", sessionID).
		Order("created_at DESC").
		Limit(limit).
		Find(&desc).Error
	if err != nil {
		return nil, err
	}

	items := make([]LibroChatMessage, 0, len(desc))
	for i := len(desc) - 1; i >= 0; i-- {
		items = append(items, desc[i])
	}
	return items, nil
}

func (r *Repository) CreateLibroChatTelemetria(ctx context.Context, row LibroChatTelemetria) error {
	if len(row.Metadata) == 0 {
		row.Metadata = []byte("{}")
	}
	return r.db.WithContext(ctx).Create(&row).Error
}

func (r *Repository) GetLibroChatReport(ctx context.Context, recursoID string, topToolsLimit int) (*LibroChatReportResponse, error) {
	if strings.TrimSpace(recursoID) == "" {
		return nil, errors.New("recurso_id es requerido")
	}
	if topToolsLimit <= 0 {
		topToolsLimit = 5
	}
	if topToolsLimit > 15 {
		topToolsLimit = 15
	}

	var sesionesTotal int64
	if err := r.db.WithContext(ctx).
		Model(&LibroChatSession{}).
		Where("libro_recurso_id = ?", recursoID).
		Count(&sesionesTotal).Error; err != nil {
		return nil, err
	}

	type aggregateRow struct {
		MensajesTotal      int64      `gorm:"column:mensajes_total"`
		MensajesUsuario    int64      `gorm:"column:mensajes_usuario"`
		MensajesAsistente  int64      `gorm:"column:mensajes_asistente"`
		FallbackTotal      int64      `gorm:"column:fallback_total"`
		LatenciaPromedioMs float64    `gorm:"column:latencia_promedio_ms"`
		UltimoMensajeAt    *time.Time `gorm:"column:ultimo_mensaje_at"`
	}

	var agg aggregateRow
	err := r.db.WithContext(ctx).
		Table("internal.libro_chat_message m").
		Select(`
			COUNT(*)::bigint AS mensajes_total,
			COALESCE(SUM(CASE WHEN m.role = 'user' THEN 1 ELSE 0 END), 0)::bigint AS mensajes_usuario,
			COALESCE(SUM(CASE WHEN m.role = 'assistant' THEN 1 ELSE 0 END), 0)::bigint AS mensajes_asistente,
			COALESCE(SUM(CASE WHEN m.used_fallback THEN 1 ELSE 0 END), 0)::bigint AS fallback_total,
			COALESCE(AVG(m.latency_ms), 0)::double precision AS latencia_promedio_ms,
			MAX(m.created_at) AS ultimo_mensaje_at
		`).
		Joins("JOIN internal.libro_chat_session s ON s.id = m.session_id").
		Where("s.libro_recurso_id = ?", recursoID).
		Scan(&agg).Error
	if err != nil {
		return nil, err
	}

	type toolUsageRow struct {
		Name       string `gorm:"column:name"`
		UsageCount int64  `gorm:"column:usage_count"`
	}
	var toolRows []toolUsageRow
	err = r.db.WithContext(ctx).
		Raw(`
			SELECT
				COALESCE(tool_item->>'name', 'desconocido') AS name,
				COUNT(*)::bigint AS usage_count
			FROM internal.libro_chat_telemetria t
			CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.metadata->'tool_calls', '[]'::jsonb)) AS tool_item
			WHERE t.libro_recurso_id = ?
				AND t.event_type = 'chat_message'
			GROUP BY 1
			ORDER BY usage_count DESC, name ASC
			LIMIT ?
		`, recursoID, topToolsLimit).
		Scan(&toolRows).Error
	if err != nil {
		return nil, err
	}

	topTools := make([]LibroChatToolUsage, 0, len(toolRows))
	for _, row := range toolRows {
		topTools = append(topTools, LibroChatToolUsage{
			Name:       row.Name,
			UsageCount: row.UsageCount,
		})
	}

	return &LibroChatReportResponse{
		RecursoID:          recursoID,
		SesionesTotal:      sesionesTotal,
		MensajesTotal:      agg.MensajesTotal,
		MensajesUsuario:    agg.MensajesUsuario,
		MensajesAsistente:  agg.MensajesAsistente,
		FallbackTotal:      agg.FallbackTotal,
		LatenciaPromedioMs: agg.LatenciaPromedioMs,
		UltimoMensajeAt:    agg.UltimoMensajeAt,
		TopTools:           topTools,
	}, nil
}

func (r *Repository) ListPreguntasContextByLibroRecurso(ctx context.Context, libroRecursoID string, limit int) ([]TrabajoPregunta, error) {
	if limit <= 0 {
		limit = 12
	}
	if limit > 40 {
		limit = 40
	}

	var items []TrabajoPregunta
	err := r.db.WithContext(ctx).
		Table("internal.trabajo_pregunta").
		Joins("JOIN internal.trabajo_libro_recurso tlr ON tlr.trabajo_id = internal.trabajo_pregunta.trabajo_id").
		Where("tlr.libro_recurso_id = ?", libroRecursoID).
		Order("internal.trabajo_pregunta.pagina_libro ASC NULLS LAST, internal.trabajo_pregunta.orden ASC, internal.trabajo_pregunta.created_at ASC").
		Limit(limit).
		Find(&items).Error
	if err != nil {
		return nil, err
	}
	return items, nil
}

func (r *Repository) SearchPreguntasContextByLibroRecurso(ctx context.Context, libroRecursoID, query string, limit int) ([]TrabajoPregunta, error) {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return r.ListPreguntasContextByLibroRecurso(ctx, libroRecursoID, limit)
	}
	if limit <= 0 {
		limit = 12
	}
	if limit > 30 {
		limit = 30
	}

	terms := strings.Fields(strings.ToLower(trimmed))
	if len(terms) > 6 {
		terms = terms[:6]
	}

	whereLike := make([]string, 0, len(terms))
	args := make([]interface{}, 0, len(terms)+2)
	args = append(args, libroRecursoID)
	for _, term := range terms {
		if len(term) < 3 {
			continue
		}
		whereLike = append(whereLike, "LOWER(internal.trabajo_pregunta.texto) LIKE ?")
		args = append(args, "%"+term+"%")
	}
	if len(whereLike) == 0 {
		return r.ListPreguntasContextByLibroRecurso(ctx, libroRecursoID, limit)
	}

	querySQL := fmt.Sprintf("(%s)", strings.Join(whereLike, " OR "))

	var items []TrabajoPregunta
	err := r.db.WithContext(ctx).
		Table("internal.trabajo_pregunta").
		Joins("JOIN internal.trabajo_libro_recurso tlr ON tlr.trabajo_id = internal.trabajo_pregunta.trabajo_id").
		Where("tlr.libro_recurso_id = ?", libroRecursoID).
		Where(querySQL, args[1:]...).
		Order("internal.trabajo_pregunta.pagina_libro ASC NULLS LAST, internal.trabajo_pregunta.orden ASC, internal.trabajo_pregunta.created_at ASC").
		Limit(limit).
		Find(&items).Error
	if err != nil {
		return nil, err
	}
	if len(items) > 0 {
		return items, nil
	}
	return r.ListPreguntasContextByLibroRecurso(ctx, libroRecursoID, limit)
}

func asRawJSON(v interface{}) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("{}")
	}
	return b
}
