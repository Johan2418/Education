package resources

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/arcanea/backend/internal/config"
)

type Service struct {
	repo                   *Repository
	libreOfficePath        string
	conversionAPIUrl       string
	conversionAPIKey       string
	conversionAPIHeader    string
	conversionAPIPrefix    string
	conversionAPIFileField string
}

func NewService(repo *Repository, libreOfficePath string, conversionAPIConfig config.ConversionAPIConfig) *Service {
	return &Service{
		repo:                   repo,
		libreOfficePath:        strings.TrimSpace(libreOfficePath),
		conversionAPIUrl:       strings.TrimSpace(conversionAPIConfig.URL),
		conversionAPIKey:       strings.TrimSpace(conversionAPIConfig.APIKey),
		conversionAPIHeader:    strings.TrimSpace(conversionAPIConfig.Header),
		conversionAPIPrefix:    conversionAPIConfig.Prefix,
		conversionAPIFileField: strings.TrimSpace(conversionAPIConfig.FileField),
	}
}

// ─── Recurso ────────────────────────────────────────────────

func (s *Service) ListRecursos(ctx context.Context) ([]Recurso, error) {
	return s.repo.ListRecursos(ctx)
}

func (s *Service) GetRecurso(ctx context.Context, id string) (*Recurso, error) {
	return s.repo.GetRecurso(ctx, id)
}

func (s *Service) CreateRecurso(ctx context.Context, req RecursoRequest, createdBy string) (*Recurso, error) {
	if req.Titulo == "" {
		return nil, errors.New("el título es obligatorio")
	}
	return s.repo.CreateRecurso(ctx, req, createdBy)
}

func (s *Service) UpdateRecurso(ctx context.Context, id string, req RecursoRequest) (*Recurso, error) {
	return s.repo.UpdateRecurso(ctx, id, req)
}

func (s *Service) DeleteRecurso(ctx context.Context, id string) error {
	return s.repo.DeleteRecurso(ctx, id)
}

func (s *Service) ConvertPptxToPdf(ctx context.Context, pptxBytes []byte) ([]byte, error) {
	if s.conversionAPIUrl != "" {
		pdf, err := s.convertPptxToPdfRemote(ctx, pptxBytes)
		if err == nil {
			return pdf, nil
		}
		return nil, fmt.Errorf("no se pudo convertir PPTX con servicio externo: %w", err)
	}

	tmpDir, err := os.MkdirTemp("", "pptx-convert-*")
	if err != nil {
		return nil, fmt.Errorf("no se pudo crear directorio temporal: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	inputPath := filepath.Join(tmpDir, "input.pptx")
	outputPath := filepath.Join(tmpDir, "input.pdf")

	if err := os.WriteFile(inputPath, pptxBytes, 0o600); err != nil {
		return nil, fmt.Errorf("no se pudo escribir el archivo PPTX temporal: %w", err)
	}

	binary, err := s.findLibreOfficeExecutable()
	if err != nil {
		return nil, err
	}

	cmd := exec.CommandContext(ctx, binary, "--headless", "--convert-to", "pdf", "--outdir", tmpDir, inputPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("error al convertir PPTX con LibreOffice (%s): %w: %s", binary, err, string(output))
	}

	pdfBytes, err := os.ReadFile(outputPath)
	if err != nil {
		return nil, fmt.Errorf("no se pudo leer el PDF generado: %w", err)
	}

	return pdfBytes, nil
}

func (s *Service) ConvertDocxToPdf(ctx context.Context, docxBytes []byte) ([]byte, error) {
	tmpDir, err := os.MkdirTemp("", "docx-convert-*")
	if err != nil {
		return nil, fmt.Errorf("no se pudo crear directorio temporal: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	inputPath := filepath.Join(tmpDir, "input.docx")
	outputPath := filepath.Join(tmpDir, "input.pdf")

	if err := os.WriteFile(inputPath, docxBytes, 0o600); err != nil {
		return nil, fmt.Errorf("no se pudo escribir el archivo DOCX temporal: %w", err)
	}

	binary, err := s.findLibreOfficeExecutable()
	if err != nil {
		return nil, err
	}

	cmd := exec.CommandContext(ctx, binary, "--headless", "--convert-to", "pdf", "--outdir", tmpDir, inputPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("error al convertir DOCX con LibreOffice (%s): %w: %s", binary, err, string(output))
	}

	pdfBytes, err := os.ReadFile(outputPath)
	if err != nil {
		return nil, fmt.Errorf("no se pudo leer el PDF generado: %w", err)
	}

	return pdfBytes, nil
}

func (s *Service) convertPptxToPdfRemote(ctx context.Context, pptxBytes []byte) ([]byte, error) {
	if s.conversionAPIFileField == "" {
		s.conversionAPIFileField = "file"
	}

	payload := &bytes.Buffer{}
	writer := multipart.NewWriter(payload)
	_ = writer.WriteField("input_format", "pptx")
	_ = writer.WriteField("output_format", "pdf")

	filePart, err := writer.CreateFormFile(s.conversionAPIFileField, "presentation.pptx")
	if err != nil {
		return nil, fmt.Errorf("error preparando el archivo para conversión: %w", err)
	}
	if _, err := filePart.Write(pptxBytes); err != nil {
		return nil, fmt.Errorf("error escribiendo el contenido del PPTX: %w", err)
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("error cerrando formulario de conversión: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.conversionAPIUrl, payload)
	if err != nil {
		return nil, fmt.Errorf("error creando petición de conversión externa: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if s.conversionAPIKey != "" {
		headerName := s.conversionAPIHeader
		if headerName == "" {
			headerName = "Authorization"
		}
		req.Header.Set(headerName, fmt.Sprintf("%s%s", s.conversionAPIPrefix, s.conversionAPIKey))
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error al llamar al servicio de conversión externa: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error leyendo la respuesta del servicio de conversión externa: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("servicio de conversión externa respondió %d: %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

func (s *Service) findLibreOfficeExecutable() (string, error) {
	candidates := []string{}
	if s.libreOfficePath != "" {
		candidates = append(candidates, s.libreOfficePath)
	}
	candidates = append(candidates, "soffice", "libreoffice")

	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		resolved, err := exec.LookPath(candidate)
		if err == nil {
			return resolved, nil
		}
	}

	return "", errors.New("no se encontró LibreOffice en el sistema. Instala LibreOffice y asegúrate de que el binario 'soffice' esté en el PATH o configura LIBREOFFICE_PATH con la ruta completa al ejecutable")
}

// ─── Recurso Personal ───────────────────────────────────────

func (s *Service) ListRecursosPersonales(ctx context.Context, userID, userRole string, q ListRecursosPersonalesQuery) ([]RecursoPersonal, error) {
	if !canUsePersonalResources(userRole) {
		return nil, errors.New("no autorizado")
	}

	query := ListRecursosPersonalesQuery{
		Q:      strings.TrimSpace(q.Q),
		Tipo:   strings.ToLower(strings.TrimSpace(q.Tipo)),
		Activo: q.Activo,
	}

	if query.Tipo != "" && !isValidRecursoPersonalType(query.Tipo) {
		return nil, errors.New("tipo de recurso personal invalido")
	}

	return s.repo.ListRecursosPersonales(ctx, userID, canManageAnyPersonalResource(userRole), query)
}

func (s *Service) GetRecursoPersonal(ctx context.Context, id, userID, userRole string) (*RecursoPersonal, error) {
	if !canUsePersonalResources(userRole) {
		return nil, errors.New("no autorizado")
	}
	if strings.TrimSpace(id) == "" {
		return nil, errors.New("id de recurso personal requerido")
	}

	item, err := s.repo.GetRecursoPersonal(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := authorizePersonalResourceRead(item, userID, userRole); err != nil {
		return nil, err
	}

	return item, nil
}

func (s *Service) CreateRecursoPersonal(ctx context.Context, req RecursoPersonalRequest, userID, userRole string) (*RecursoPersonal, error) {
	if !canUsePersonalResources(userRole) {
		return nil, errors.New("no autorizado")
	}

	req = normalizeRecursoPersonalRequest(req)
	if err := validateRecursoPersonalRequest(req); err != nil {
		return nil, err
	}

	return s.repo.CreateRecursoPersonal(ctx, req, userID)
}

func (s *Service) UpdateRecursoPersonal(ctx context.Context, id string, req RecursoPersonalRequest, userID, userRole string) (*RecursoPersonal, error) {
	if !canUsePersonalResources(userRole) {
		return nil, errors.New("no autorizado")
	}
	if strings.TrimSpace(id) == "" {
		return nil, errors.New("id de recurso personal requerido")
	}

	current, err := s.repo.GetRecursoPersonal(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := authorizePersonalResourceWrite(current, userID, userRole); err != nil {
		return nil, err
	}

	req = normalizeRecursoPersonalRequest(req)
	if err := validateRecursoPersonalRequest(req); err != nil {
		return nil, err
	}
	if req.Activo == nil {
		activo := current.Activo
		req.Activo = &activo
	}

	return s.repo.UpdateRecursoPersonal(ctx, id, req)
}

func (s *Service) DeleteRecursoPersonal(ctx context.Context, id, userID, userRole string) error {
	if !canUsePersonalResources(userRole) {
		return errors.New("no autorizado")
	}
	if strings.TrimSpace(id) == "" {
		return errors.New("id de recurso personal requerido")
	}

	current, err := s.repo.GetRecursoPersonal(ctx, id)
	if err != nil {
		return err
	}
	if err := authorizePersonalResourceWrite(current, userID, userRole); err != nil {
		return err
	}

	return s.repo.DeleteRecursoPersonal(ctx, id)
}

func (s *Service) ListMateriaRecursosPersonales(ctx context.Context, materiaID, userID, userRole string) ([]RecursoPersonal, error) {
	if !canUsePersonalResources(userRole) {
		return nil, errors.New("no autorizado")
	}
	if strings.TrimSpace(materiaID) == "" {
		return nil, errors.New("materia_id requerido")
	}
	if err := s.ensureTargetAccessMateria(ctx, materiaID, userID, userRole); err != nil {
		return nil, err
	}

	return s.repo.ListMateriaRecursosPersonales(ctx, materiaID, userID, canManageAnyPersonalResource(userRole))
}

func (s *Service) AttachRecursoPersonalToMateria(ctx context.Context, materiaID, recursoPersonalID, userID, userRole string) error {
	if !canUsePersonalResources(userRole) {
		return errors.New("no autorizado")
	}
	if strings.TrimSpace(materiaID) == "" || strings.TrimSpace(recursoPersonalID) == "" {
		return errors.New("materia_id y recurso_personal_id son requeridos")
	}
	if err := s.ensureTargetAccessMateria(ctx, materiaID, userID, userRole); err != nil {
		return err
	}
	resource, err := s.repo.GetRecursoPersonal(ctx, recursoPersonalID)
	if err != nil {
		return err
	}
	if err := authorizePersonalResourceWrite(resource, userID, userRole); err != nil {
		return err
	}

	return s.repo.AttachRecursoPersonalToMateria(ctx, materiaID, recursoPersonalID, userID)
}

func (s *Service) DetachRecursoPersonalFromMateria(ctx context.Context, materiaID, recursoPersonalID, userID, userRole string) error {
	if !canUsePersonalResources(userRole) {
		return errors.New("no autorizado")
	}
	if strings.TrimSpace(materiaID) == "" || strings.TrimSpace(recursoPersonalID) == "" {
		return errors.New("materia_id y recurso_personal_id son requeridos")
	}
	if err := s.ensureTargetAccessMateria(ctx, materiaID, userID, userRole); err != nil {
		return err
	}
	resource, err := s.repo.GetRecursoPersonal(ctx, recursoPersonalID)
	if err != nil {
		return err
	}
	if err := authorizePersonalResourceWrite(resource, userID, userRole); err != nil {
		return err
	}

	return s.repo.DetachRecursoPersonalFromMateria(ctx, materiaID, recursoPersonalID)
}

func (s *Service) ListSeccionRecursosPersonales(ctx context.Context, seccionID, userID, userRole string) ([]RecursoPersonal, error) {
	if !canUsePersonalResources(userRole) {
		return nil, errors.New("no autorizado")
	}
	if strings.TrimSpace(seccionID) == "" {
		return nil, errors.New("seccion_id requerido")
	}
	if err := s.ensureTargetAccessSeccion(ctx, seccionID, userID, userRole); err != nil {
		return nil, err
	}

	return s.repo.ListSeccionRecursosPersonales(ctx, seccionID, userID, canManageAnyPersonalResource(userRole))
}

func (s *Service) AttachRecursoPersonalToSeccion(ctx context.Context, seccionID, recursoPersonalID, userID, userRole string) error {
	if !canUsePersonalResources(userRole) {
		return errors.New("no autorizado")
	}
	if strings.TrimSpace(seccionID) == "" || strings.TrimSpace(recursoPersonalID) == "" {
		return errors.New("seccion_id y recurso_personal_id son requeridos")
	}
	if err := s.ensureTargetAccessSeccion(ctx, seccionID, userID, userRole); err != nil {
		return err
	}
	resource, err := s.repo.GetRecursoPersonal(ctx, recursoPersonalID)
	if err != nil {
		return err
	}
	if err := authorizePersonalResourceWrite(resource, userID, userRole); err != nil {
		return err
	}

	return s.repo.AttachRecursoPersonalToSeccion(ctx, seccionID, recursoPersonalID, userID)
}

func (s *Service) DetachRecursoPersonalFromSeccion(ctx context.Context, seccionID, recursoPersonalID, userID, userRole string) error {
	if !canUsePersonalResources(userRole) {
		return errors.New("no autorizado")
	}
	if strings.TrimSpace(seccionID) == "" || strings.TrimSpace(recursoPersonalID) == "" {
		return errors.New("seccion_id y recurso_personal_id son requeridos")
	}
	if err := s.ensureTargetAccessSeccion(ctx, seccionID, userID, userRole); err != nil {
		return err
	}
	resource, err := s.repo.GetRecursoPersonal(ctx, recursoPersonalID)
	if err != nil {
		return err
	}
	if err := authorizePersonalResourceWrite(resource, userID, userRole); err != nil {
		return err
	}

	return s.repo.DetachRecursoPersonalFromSeccion(ctx, seccionID, recursoPersonalID)
}

func (s *Service) ListTrabajoRecursosPersonales(ctx context.Context, trabajoID, userID, userRole string) ([]RecursoPersonal, error) {
	if !canUsePersonalResources(userRole) {
		return nil, errors.New("no autorizado")
	}
	if strings.TrimSpace(trabajoID) == "" {
		return nil, errors.New("trabajo_id requerido")
	}
	if err := s.ensureTargetAccessTrabajo(ctx, trabajoID, userID, userRole); err != nil {
		return nil, err
	}

	return s.repo.ListTrabajoRecursosPersonales(ctx, trabajoID, userID, canManageAnyPersonalResource(userRole))
}

func (s *Service) AttachRecursoPersonalToTrabajo(ctx context.Context, trabajoID, recursoPersonalID, userID, userRole string) error {
	if !canUsePersonalResources(userRole) {
		return errors.New("no autorizado")
	}
	if strings.TrimSpace(trabajoID) == "" || strings.TrimSpace(recursoPersonalID) == "" {
		return errors.New("trabajo_id y recurso_personal_id son requeridos")
	}
	if err := s.ensureTargetAccessTrabajo(ctx, trabajoID, userID, userRole); err != nil {
		return err
	}
	resource, err := s.repo.GetRecursoPersonal(ctx, recursoPersonalID)
	if err != nil {
		return err
	}
	if err := authorizePersonalResourceWrite(resource, userID, userRole); err != nil {
		return err
	}

	return s.repo.AttachRecursoPersonalToTrabajo(ctx, trabajoID, recursoPersonalID, userID)
}

func (s *Service) DetachRecursoPersonalFromTrabajo(ctx context.Context, trabajoID, recursoPersonalID, userID, userRole string) error {
	if !canUsePersonalResources(userRole) {
		return errors.New("no autorizado")
	}
	if strings.TrimSpace(trabajoID) == "" || strings.TrimSpace(recursoPersonalID) == "" {
		return errors.New("trabajo_id y recurso_personal_id son requeridos")
	}
	if err := s.ensureTargetAccessTrabajo(ctx, trabajoID, userID, userRole); err != nil {
		return err
	}
	resource, err := s.repo.GetRecursoPersonal(ctx, recursoPersonalID)
	if err != nil {
		return err
	}
	if err := authorizePersonalResourceWrite(resource, userID, userRole); err != nil {
		return err
	}

	return s.repo.DetachRecursoPersonalFromTrabajo(ctx, trabajoID, recursoPersonalID)
}

// ─── Modelo RA ──────────────────────────────────────────────

func (s *Service) ListModelos(ctx context.Context) ([]ModeloRA, error) {
	return s.repo.ListModelos(ctx)
}

func (s *Service) GetModelo(ctx context.Context, id string) (*ModeloRA, error) {
	return s.repo.GetModelo(ctx, id)
}

func (s *Service) CreateModelo(ctx context.Context, req ModeloRARequest, createdBy string) (*ModeloRA, error) {
	if req.NombreModelo == "" {
		return nil, errors.New("el nombre del modelo es obligatorio")
	}
	return s.repo.CreateModelo(ctx, req, createdBy)
}

func (s *Service) UpdateModelo(ctx context.Context, id string, req ModeloRARequest) (*ModeloRA, error) {
	return s.repo.UpdateModelo(ctx, id, req)
}

func (s *Service) DeleteModelo(ctx context.Context, id string) error {
	return s.repo.DeleteModelo(ctx, id)
}

func canUsePersonalResources(role string) bool {
	return role == "teacher" || role == "admin" || role == "super_admin"
}

func canManageAnyPersonalResource(role string) bool {
	return role == "admin" || role == "super_admin"
}

func authorizePersonalResourceRead(item *RecursoPersonal, userID, userRole string) error {
	if item == nil {
		return errors.New("recurso personal no encontrado")
	}
	if canManageAnyPersonalResource(userRole) {
		return nil
	}
	if item.OwnerTeacherID != userID {
		return errors.New("no autorizado para este recurso personal")
	}
	return nil
}

func authorizePersonalResourceWrite(item *RecursoPersonal, userID, userRole string) error {
	if item == nil {
		return errors.New("recurso personal no encontrado")
	}
	if canManageAnyPersonalResource(userRole) {
		return nil
	}
	if item.OwnerTeacherID != userID {
		return errors.New("no autorizado para este recurso personal")
	}
	return nil
}

func (s *Service) ensureTargetAccessMateria(ctx context.Context, materiaID, userID, userRole string) error {
	if canManageAnyPersonalResource(userRole) {
		return nil
	}
	if userRole != "teacher" {
		return errors.New("no autorizado")
	}

	ok, err := s.repo.IsTeacherOfMateria(ctx, userID, materiaID)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("no autorizado para esta materia")
	}
	return nil
}

func (s *Service) ensureTargetAccessSeccion(ctx context.Context, seccionID, userID, userRole string) error {
	if canManageAnyPersonalResource(userRole) {
		return nil
	}
	if userRole != "teacher" {
		return errors.New("no autorizado")
	}

	ok, err := s.repo.IsTeacherOfSeccion(ctx, userID, seccionID)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("no autorizado para esta sección")
	}
	return nil
}

func (s *Service) ensureTargetAccessTrabajo(ctx context.Context, trabajoID, userID, userRole string) error {
	if canManageAnyPersonalResource(userRole) {
		return nil
	}
	if userRole != "teacher" {
		return errors.New("no autorizado")
	}

	ok, err := s.repo.IsTeacherOfTrabajo(ctx, userID, trabajoID)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("no autorizado para este trabajo")
	}
	return nil
}

func isValidRecursoPersonalType(tipo string) bool {
	switch tipo {
	case "presentacion", "documento", "video_url", "enlace", "html_embed", "texto":
		return true
	default:
		return false
	}
}

func normalizeOptionalText(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizeRecursoPersonalRequest(req RecursoPersonalRequest) RecursoPersonalRequest {
	req.Titulo = strings.TrimSpace(req.Titulo)
	req.Tipo = strings.ToLower(strings.TrimSpace(req.Tipo))
	req.Descripcion = normalizeOptionalText(req.Descripcion)
	req.URL = normalizeOptionalText(req.URL)
	req.HTMLContenido = normalizeOptionalText(req.HTMLContenido)
	req.TextoContenido = normalizeOptionalText(req.TextoContenido)

	if req.Tags != nil {
		cleaned := make([]string, 0, len(req.Tags))
		seen := map[string]struct{}{}
		for _, raw := range req.Tags {
			tag := strings.TrimSpace(raw)
			if tag == "" {
				continue
			}
			key := strings.ToLower(tag)
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			cleaned = append(cleaned, tag)
		}
		req.Tags = cleaned
	}

	return req
}

func validateRecursoPersonalRequest(req RecursoPersonalRequest) error {
	if req.Titulo == "" {
		return errors.New("el título es obligatorio")
	}
	if !isValidRecursoPersonalType(req.Tipo) {
		return errors.New("tipo de recurso personal invalido")
	}

	switch req.Tipo {
	case "presentacion", "documento", "video_url", "enlace":
		if req.URL == nil {
			return errors.New("la url es obligatoria para este tipo de recurso")
		}
	case "html_embed":
		if req.HTMLContenido == nil {
			return errors.New("el contenido html es obligatorio para html_embed")
		}
	case "texto":
		if req.TextoContenido == nil {
			return errors.New("el contenido de texto es obligatorio para tipo texto")
		}
	}

	return nil
}
