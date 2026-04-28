package interactive

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strings"
	"time"

	"gorm.io/gorm"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) ListActividadesByLeccion(ctx context.Context, leccionID, userID, userRole string) ([]ActividadInteractiva, error) {
	if strings.TrimSpace(leccionID) == "" {
		return nil, errors.New("leccion_id es requerido")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfLeccion(ctx, userID, leccionID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para esta lección")
		}
	}
	return s.repo.ListActividadesByLeccion(ctx, leccionID)
}

func (s *Service) GetActividad(ctx context.Context, actividadID, userID, userRole string) (*ActividadInteractiva, error) {
	if strings.TrimSpace(actividadID) == "" {
		return nil, errors.New("actividad_id es requerido")
	}
	item, err := s.repo.GetActividad(ctx, actividadID)
	if err != nil {
		return nil, err
	}

	switch userRole {
	case "student":
		ok, checkErr := s.repo.IsStudentEnrolledInActividad(ctx, userID, actividadID)
		if checkErr != nil {
			return nil, checkErr
		}
		if !ok {
			return nil, errors.New("no autorizado para esta actividad")
		}
	case "teacher":
		ok, checkErr := s.repo.IsTeacherOfActividad(ctx, userID, actividadID)
		if checkErr != nil {
			return nil, checkErr
		}
		if !ok {
			return nil, errors.New("no autorizado para esta actividad")
		}
	case "admin", "super_admin":
		// allowed
	default:
		return nil, errors.New("no autorizado")
	}

	return item, nil
}

func (s *Service) CreateActividad(ctx context.Context, req ActividadInteractivaRequest, userID, userRole string) (*ActividadInteractiva, error) {
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}
	req = normalizeActividadRequest(req, "")
	if err := s.validateActividadRequest(req); err != nil {
		return nil, err
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfLeccion(ctx, userID, req.LeccionID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para esta lección")
		}
	}
	return s.repo.CreateActividad(ctx, req, userID)
}

func (s *Service) UpdateActividad(ctx context.Context, actividadID string, req ActividadInteractivaRequest, userID, userRole string) (*ActividadInteractiva, error) {
	if strings.TrimSpace(actividadID) == "" {
		return nil, errors.New("actividad_id es requerido")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfActividad(ctx, userID, actividadID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para esta actividad")
		}
	}
	existing, err := s.repo.GetActividad(ctx, actividadID)
	if err != nil {
		return nil, err
	}
	req = normalizeActividadRequest(req, existing.Proveedor)
	if err := s.validateActividadUpdate(req, existing.Proveedor); err != nil {
		return nil, err
	}
	return s.repo.UpdateActividad(ctx, actividadID, req)
}

func (s *Service) DeleteActividad(ctx context.Context, actividadID, userID, userRole string) error {
	if strings.TrimSpace(actividadID) == "" {
		return errors.New("actividad_id es requerido")
	}
	if !canManage(userRole) {
		return errors.New("no autorizado")
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfActividad(ctx, userID, actividadID)
		if err != nil {
			return err
		}
		if !ok {
			return errors.New("no autorizado para esta actividad")
		}
	}
	return s.repo.DeleteActividad(ctx, actividadID)
}

func (s *Service) GetMiIntento(ctx context.Context, actividadID, userID, userRole string) (*ActividadInteractivaIntento, error) {
	if strings.TrimSpace(actividadID) == "" {
		return nil, errors.New("actividad_id es requerido")
	}
	if userRole == "student" {
		ok, err := s.repo.IsStudentEnrolledInActividad(ctx, userID, actividadID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para esta actividad")
		}
	}
	return s.repo.GetMiIntento(ctx, actividadID, userID)
}

func (s *Service) UpsertIntento(ctx context.Context, actividadID, userID, userRole string, req UpsertIntentoRequest) (*ActividadInteractivaIntento, error) {
	if strings.TrimSpace(actividadID) == "" {
		return nil, errors.New("actividad_id es requerido")
	}
	if userRole != "student" {
		return nil, errors.New("solo estudiantes pueden registrar intentos")
	}
	ok, err := s.repo.IsStudentEnrolledInActividad(ctx, userID, actividadID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("no autorizado para esta actividad")
	}

	actividad, err := s.repo.GetActividad(ctx, actividadID)
	if err != nil {
		return nil, err
	}
	if !actividad.Activo {
		return nil, errors.New("actividad inactiva")
	}

	var existingIntento *ActividadInteractivaIntento
	existingIntento, err = s.repo.GetMiIntento(ctx, actividadID, userID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		existingIntento = nil
	}

	if req.ScoreNormalizado != nil && (*req.ScoreNormalizado < 0 || *req.ScoreNormalizado > 100) {
		return nil, errors.New("score_normalizado debe estar entre 0 y 100")
	}
	if req.ScoreObtenido != nil && *req.ScoreObtenido > actividad.PuntajeMaximo {
		return nil, errors.New("score_obtenido excede puntaje_maximo de la actividad")
	}
	if req.TiempoDedicado != nil && *req.TiempoDedicado < 0 {
		return nil, errors.New("tiempo_dedicado debe ser >= 0")
	}
	if req.Intentos != nil && *req.Intentos < 0 {
		return nil, errors.New("intentos debe ser >= 0")
	}

	if existingIntento != nil {
		if req.Intentos != nil && *req.Intentos < existingIntento.Intentos {
			maxIntentos := existingIntento.Intentos
			req.Intentos = &maxIntentos
		}
		if req.TiempoDedicado != nil && *req.TiempoDedicado < existingIntento.TiempoDedicado {
			maxTiempo := existingIntento.TiempoDedicado
			req.TiempoDedicado = &maxTiempo
		}
	}

	if actividad.IntentosMaximos != nil && req.Intentos != nil && *req.Intentos > *actividad.IntentosMaximos {
		return nil, errors.New("se excedio el maximo de intentos permitido")
	}
	if len(req.Metadata) > 0 && !json.Valid(req.Metadata) {
		return nil, errors.New("metadata debe ser un JSON válido")
	}

	if len(req.Metadata) > 0 {
		incomingEventID := extractMetadataString(req.Metadata, "event_id", "eventId")
		incomingEventKey := extractMetadataString(req.Metadata, "event_key")

		if existingIntento != nil {
			existingEventID := extractMetadataString(existingIntento.Metadata, "event_id", "eventId")
			existingEventKey := extractMetadataString(existingIntento.Metadata, "event_key")
			if incomingEventID != "" && incomingEventID == existingEventID {
				return existingIntento, nil
			}
			if incomingEventKey != "" && incomingEventKey == existingEventKey {
				return existingIntento, nil
			}
		}

		allowedOrigins := extractAllowedOriginsFromConfig(actividad.Configuracion)
		incomingOrigin := extractMetadataString(req.Metadata, "event_origin", "origin")
		if incomingOrigin != "" && len(allowedOrigins) > 0 && !isAllowedOrigin(incomingOrigin, allowedOrigins) {
			return nil, errors.New("event_origin no permitido para la actividad")
		}
	}

	if actividad.ReglaCompletitud == "puntaje" && req.ScoreNormalizado != nil {
		threshold := resolveScoreThresholdFromConfig(actividad.Configuracion)
		if *req.ScoreNormalizado >= threshold {
			completed := true
			req.Completado = &completed
			if req.CompletedAt == nil {
				now := time.Now()
				req.CompletedAt = &now
			}
		}
	}

	return s.repo.UpsertIntento(ctx, actividadID, userID, req)
}

func (s *Service) ListIntentosByActividad(ctx context.Context, actividadID, userID, userRole string) ([]ActividadInteractivaIntento, error) {
	if strings.TrimSpace(actividadID) == "" {
		return nil, errors.New("actividad_id es requerido")
	}
	if !canManage(userRole) {
		return nil, errors.New("no autorizado")
	}
	if userRole == "teacher" {
		ok, err := s.repo.IsTeacherOfActividad(ctx, userID, actividadID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, errors.New("no autorizado para esta actividad")
		}
	}
	return s.repo.ListIntentosByActividad(ctx, actividadID)
}

func (s *Service) validateActividadRequest(req ActividadInteractivaRequest) error {
	if strings.TrimSpace(req.LeccionID) == "" {
		return errors.New("leccion_id es requerido")
	}
	if strings.TrimSpace(req.Titulo) == "" {
		return errors.New("titulo es requerido")
	}
	if err := validateProveedor(req.Proveedor); err != nil {
		return err
	}
	if err := validateEmbedURL(req.Proveedor, req.EmbedURL); err != nil {
		return err
	}
	if req.ReglaCompletitud != nil {
		if err := validateRegla(*req.ReglaCompletitud); err != nil {
			return err
		}
	}
	if req.PuntajeMaximo != nil && *req.PuntajeMaximo <= 0 {
		return errors.New("puntaje_maximo debe ser > 0")
	}
	if req.IntentosMaximos != nil && *req.IntentosMaximos <= 0 {
		return errors.New("intentos_maximos debe ser > 0")
	}
	if len(req.Configuracion) > 0 && !json.Valid(req.Configuracion) {
		return errors.New("configuracion debe ser JSON valido")
	}
	if req.Proveedor == "nativo" {
		if err := validateNativeConfig(req.Configuracion); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) validateActividadUpdate(req ActividadInteractivaRequest, currentProveedor string) error {
	if req.Titulo != "" && strings.TrimSpace(req.Titulo) == "" {
		return errors.New("titulo es invalido")
	}

	finalProveedor := currentProveedor
	if req.Proveedor != "" {
		if err := validateProveedor(req.Proveedor); err != nil {
			return err
		}
		finalProveedor = req.Proveedor
	}

	if req.EmbedURL != "" || finalProveedor == "nativo" {
		if err := validateEmbedURL(finalProveedor, req.EmbedURL); err != nil {
			return err
		}
	}
	if req.ReglaCompletitud != nil {
		if err := validateRegla(*req.ReglaCompletitud); err != nil {
			return err
		}
	}
	if req.PuntajeMaximo != nil && *req.PuntajeMaximo <= 0 {
		return errors.New("puntaje_maximo debe ser > 0")
	}
	if req.IntentosMaximos != nil && *req.IntentosMaximos <= 0 {
		return errors.New("intentos_maximos debe ser > 0")
	}
	if len(req.Configuracion) > 0 && !json.Valid(req.Configuracion) {
		return errors.New("configuracion debe ser JSON valido")
	}
	if finalProveedor == "nativo" {
		if req.Proveedor == "nativo" && len(req.Configuracion) == 0 && currentProveedor != "nativo" {
			return errors.New("configuracion es requerida para proveedor nativo")
		}
		if len(req.Configuracion) > 0 {
			if err := validateNativeConfig(req.Configuracion); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateProveedor(proveedor string) error {
	switch strings.TrimSpace(strings.ToLower(proveedor)) {
	case "h5p", "genially", "educaplay", "nativo":
		return nil
	default:
		return errors.New("proveedor invalido")
	}
}

func validateRegla(regla string) error {
	switch strings.TrimSpace(strings.ToLower(regla)) {
	case "manual", "evento", "puntaje":
		return nil
	default:
		return errors.New("regla_completitud invalida")
	}
}

func validateEmbedURL(proveedor, raw string) error {
	provider := strings.ToLower(strings.TrimSpace(proveedor))
	raw = strings.TrimSpace(raw)
	if provider == "nativo" && raw == "" {
		return nil
	}
	if raw == "" {
		return errors.New("embed_url es requerido")
	}

	u, err := url.ParseRequestURI(raw)
	if err != nil {
		return errors.New("embed_url invalido")
	}
	if !strings.EqualFold(u.Scheme, "https") {
		return errors.New("embed_url debe usar https")
	}
	if provider == "nativo" {
		return nil
	}

	host := strings.ToLower(u.Hostname())
	allowed := allowedDomainsByProvider[provider]
	if len(allowed) == 0 {
		return errors.New("proveedor invalido")
	}
	for _, domain := range allowed {
		if host == domain || strings.HasSuffix(host, "."+domain) {
			return nil
		}
	}
	return errors.New("dominio no permitido para el proveedor")
}

func canManage(role string) bool {
	return role == "teacher" || role == "admin" || role == "super_admin"
}

func normalizeActividadRequest(req ActividadInteractivaRequest, fallbackProveedor string) ActividadInteractivaRequest {
	req.LeccionID = strings.TrimSpace(req.LeccionID)
	req.Titulo = strings.TrimSpace(req.Titulo)
	req.EmbedURL = strings.TrimSpace(req.EmbedURL)

	if req.Proveedor != "" {
		req.Proveedor = strings.ToLower(strings.TrimSpace(req.Proveedor))
	} else if fallbackProveedor != "" {
		req.Proveedor = strings.ToLower(strings.TrimSpace(fallbackProveedor))
	}

	if req.ReglaCompletitud != nil {
		normalized := strings.ToLower(strings.TrimSpace(*req.ReglaCompletitud))
		req.ReglaCompletitud = &normalized
	}

	return req
}

func validateNativeConfig(config json.RawMessage) error {
	if len(config) == 0 || !json.Valid(config) {
		return errors.New("configuracion es requerida y debe ser JSON valido para proveedor nativo")
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(config, &payload); err != nil {
		return errors.New("configuracion invalida para proveedor nativo")
	}

	rawQuestions, ok := payload["preguntas"]
	if !ok {
		rawQuestions = payload["questions"]
	}
	questions, ok := rawQuestions.([]interface{})
	if !ok || len(questions) == 0 {
		return errors.New("configuracion nativa requiere al menos una pregunta")
	}

	for _, rawQuestion := range questions {
		questionObj, ok := rawQuestion.(map[string]interface{})
		if !ok {
			return errors.New("configuracion nativa contiene preguntas invalidas")
		}

		prompt := asTrimmedString(questionObj["prompt"])
		if prompt == "" {
			prompt = asTrimmedString(questionObj["enunciado"])
		}
		if prompt == "" {
			return errors.New("cada pregunta nativa debe tener prompt")
		}

		rawOptions := questionObj["opciones"]
		if rawOptions == nil {
			rawOptions = questionObj["options"]
		}
		options, ok := rawOptions.([]interface{})
		if !ok || len(options) < 2 {
			return errors.New("cada pregunta nativa requiere al menos 2 opciones")
		}

		filled := 0
		hasCorrect := false
		for _, rawOption := range options {
			optionObj, ok := rawOption.(map[string]interface{})
			if !ok {
				continue
			}
			text := asTrimmedString(optionObj["texto"])
			if text == "" {
				text = asTrimmedString(optionObj["text"])
			}
			if text == "" {
				continue
			}
			filled++
			if asBool(optionObj["correcta"]) || asBool(optionObj["isCorrect"]) {
				hasCorrect = true
			}
		}

		if filled < 2 {
			return errors.New("cada pregunta nativa requiere al menos 2 opciones con texto")
		}
		if !hasCorrect {
			return errors.New("cada pregunta nativa requiere al menos una opcion correcta")
		}
	}

	return nil
}

func asTrimmedString(value interface{}) string {
	str, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(str)
}

func asBool(value interface{}) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		return strings.EqualFold(strings.TrimSpace(v), "true")
	default:
		return false
	}
}

func extractMetadataString(metadata json.RawMessage, keys ...string) string {
	if len(metadata) == 0 {
		return ""
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(metadata, &payload); err != nil {
		return ""
	}

	for _, key := range keys {
		raw, ok := payload[key]
		if !ok {
			continue
		}
		str, ok := raw.(string)
		if !ok {
			continue
		}
		trimmed := strings.TrimSpace(str)
		if trimmed != "" {
			return trimmed
		}
	}

	return ""
}

func extractAllowedOriginsFromConfig(config json.RawMessage) []string {
	if len(config) == 0 {
		return nil
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(config, &payload); err != nil {
		return nil
	}

	raw, ok := payload["allowed_origins"]
	if !ok {
		return nil
	}

	arr, ok := raw.([]interface{})
	if !ok {
		return nil
	}

	origins := make([]string, 0, len(arr))
	for _, item := range arr {
		value, ok := item.(string)
		if !ok {
			continue
		}
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		origins = append(origins, trimmed)
	}

	return origins
}

func isAllowedOrigin(origin string, allowlist []string) bool {
	trimmedOrigin := strings.TrimSpace(origin)
	if trimmedOrigin == "" {
		return false
	}
	if len(allowlist) == 0 {
		return true
	}

	originURL, err := url.Parse(trimmedOrigin)
	if err != nil {
		return false
	}

	normalizedOrigin := strings.ToLower(strings.TrimSpace(trimmedOrigin))
	originHost := strings.ToLower(originURL.Hostname())

	for _, candidate := range allowlist {
		normalizedCandidate := strings.ToLower(strings.TrimSpace(candidate))
		if normalizedCandidate == "" {
			continue
		}
		if normalizedCandidate == "*" || normalizedCandidate == normalizedOrigin {
			return true
		}

		candidateURL, parseErr := url.Parse(normalizedCandidate)
		if parseErr == nil {
			candidateHost := strings.ToLower(candidateURL.Hostname())
			if candidateHost == originHost || strings.HasSuffix(originHost, "."+candidateHost) {
				return true
			}
			continue
		}

		if normalizedCandidate == originHost || strings.HasSuffix(originHost, "."+normalizedCandidate) {
			return true
		}
	}

	return false
}

func resolveScoreThresholdFromConfig(config json.RawMessage) float64 {
	if len(config) == 0 {
		return 70
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(config, &payload); err != nil {
		return 70
	}

	for _, key := range []string{"score_threshold", "puntaje_minimo"} {
		raw, ok := payload[key]
		if !ok {
			continue
		}
		switch value := raw.(type) {
		case float64:
			if value < 0 {
				return 0
			}
			if value > 100 {
				return 100
			}
			return value
		}
	}

	return 70
}

var allowedDomainsByProvider = map[string][]string{
	"h5p":       {"h5p.com", "h5p.org"},
	"genially":  {"genial.ly", "genially.com"},
	"educaplay": {"educaplay.com"},
}
