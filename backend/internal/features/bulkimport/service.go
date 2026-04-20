package bulkimport

import (
	"context"
	"fmt"
	"math/rand"
	"strconv"
	"strings"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"

	"github.com/arcanea/backend/internal/features/academic"
	"github.com/arcanea/backend/internal/features/auth"
)

const emailDomain = "runachay.edu.ec"

type Service struct {
	authRepo *auth.Repository
	acadRepo *academic.Repository
	aiSvc    *AIService
	rng      *rand.Rand
}

func NewService(authRepo *auth.Repository, acadRepo *academic.Repository, aiSvc *AIService) *Service {
	return &Service{
		authRepo: authRepo,
		acadRepo: acadRepo,
		aiSvc:    aiSvc,
		rng:      rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// MapColumns delegates to the AI service.
func (s *Service) MapColumns(ctx context.Context, req ColumnMappingRequest) (*ColumnMappingResponse, error) {
	return s.aiSvc.MapColumns(ctx, req.Headers)
}

// AdminBulkImport creates student accounts for rows not yet in the platform.
func (s *Service) AdminBulkImport(ctx context.Context, req AdminBulkImportRequest, callerID string) (*AdminBulkImportResponse, error) {
	_ = callerID
	fieldMap := buildFieldLookup(req.Mappings)
	cursoID := ""
	if req.CursoID != nil {
		cursoID = strings.TrimSpace(*req.CursoID)
	}

	if cursoID != "" {
		curso, err := s.acadRepo.GetCurso(ctx, cursoID)
		if err != nil || curso == nil {
			return nil, fmt.Errorf("curso no encontrado")
		}
	}

	var created, skipped []CreatedStudent
	seenInFile := map[string]bool{}

	for _, row := range req.Rows {
		displayName := extractField(row, fieldMap, "display_name")
		email := extractField(row, fieldMap, "email")
		cedula := normalizeCedula(extractField(row, fieldMap, "cedula"))
		phone := extractField(row, fieldMap, "phone")
		email = strings.ToLower(strings.TrimSpace(email))
		hasStrongIdentity := email != "" || cedula != ""

		if displayName == "" && email == "" {
			skipped = append(skipped, CreatedStudent{
				DisplayName: displayName,
				Email:       email,
				Cedula:      cedula,
				Status:      "skipped",
				Reason:      "sin nombre ni email",
			})
			continue
		}

		identityKey := buildIdentityKey(displayName, email, cedula, phone)
		if identityKey != "" && seenInFile[identityKey] {
			skipped = append(skipped, CreatedStudent{
				DisplayName: displayName,
				Email:       email,
				Cedula:      cedula,
				Status:      "skipped",
				Reason:      "duplicado detectado en el archivo",
			})
			continue
		}
		if identityKey != "" {
			seenInFile[identityKey] = true
		}

		candidateEmails := buildCandidateEmails(displayName, email, cedula)

		// For rows with strong identifiers (email/cedula), skip existing users.
		if hasStrongIdentity {
			var exists *auth.Profile
			for _, candidate := range candidateEmails {
				existing, _ := s.authRepo.GetByEmail(ctx, candidate)
				if existing != nil {
					exists = existing
					break
				}
			}
			if exists != nil {
				skipped = append(skipped, CreatedStudent{
					DisplayName: displayName,
					Email:       exists.Email,
					Cedula:      cedula,
					Status:      "skipped",
					Reason:      "ya existe en la plataforma",
				})
				continue
			}
		}

		// Choose primary email using stable priority.
		if len(candidateEmails) > 0 {
			email = candidateEmails[0]
		}
		if email == "" {
			email = fmt.Sprintf("%s@%s", sanitizeForEmail(displayName), emailDomain)
		}

		autoAdjusted := false
		if !hasStrongIdentity {
			baseEmail := email
			uniqueEmail, err := s.generateUniqueEmail(ctx, email)
			if err != nil {
				skipped = append(skipped, CreatedStudent{
					DisplayName: displayName,
					Email:       email,
					Cedula:      cedula,
					Status:      "skipped",
					Reason:      "no se pudo generar un email único",
				})
				continue
			}
			email = uniqueEmail
			autoAdjusted = email != baseEmail
		}

		email = strings.ToLower(strings.TrimSpace(email))

		// Generate password
		password := generatePassword(displayName, s.rng)

		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			skipped = append(skipped, CreatedStudent{
				DisplayName: displayName,
				Email:       email,
				Cedula:      cedula,
				Status:      "skipped",
				Reason:      "error al procesar contraseña",
			})
			continue
		}

		var namePtr, phonePtr *string
		if displayName != "" {
			namePtr = &displayName
		}
		if phone != "" {
			phonePtr = &phone
		}

		profile, err := s.authRepo.Create(ctx, email, string(hash), namePtr, phonePtr, nil)
		if err != nil {
			skipped = append(skipped, CreatedStudent{
				DisplayName: displayName,
				Email:       email,
				Cedula:      cedula,
				Status:      "skipped",
				Reason:      "error al crear usuario: " + err.Error(),
			})
			continue
		}

		result := CreatedStudent{
			DisplayName:       displayName,
			Email:             email,
			Password:          password,
			Cedula:            cedula,
			Status:            "created",
			EmailAutoAdjusted: autoAdjusted,
		}

		if cursoID != "" {
			_, enrollErr := s.acadRepo.EnrollStudent(ctx, academic.EstudianteCursoRequest{
				EstudianteID: profile.ID,
				CursoID:      cursoID,
			})
			if enrollErr != nil {
				result.EnrolledToCourse = false
				result.EnrollmentReason = "no se pudo inscribir al curso: " + enrollErr.Error()
			} else {
				result.EnrolledToCourse = true
				result.EnrollmentReason = "inscrito en el curso seleccionado"
			}
		}

		created = append(created, result)
	}

	return &AdminBulkImportResponse{
		Created: created,
		Skipped: skipped,
		Total:   len(req.Rows),
	}, nil
}

// TeacherBulkImport enrolls students in a course where the caller has permission.
func (s *Service) TeacherBulkImport(ctx context.Context, req TeacherBulkImportRequest, cursoID, actorRole, actorID string) (*TeacherBulkImportResponse, error) {
	if strings.TrimSpace(cursoID) == "" {
		return nil, fmt.Errorf("curso inválido")
	}

	if actorRole == "teacher" {
		ok, err := s.acadRepo.IsTeacherAssignedToCurso(ctx, strings.TrimSpace(actorID), strings.TrimSpace(cursoID))
		if err != nil {
			return nil, fmt.Errorf("error validando permisos del curso: %w", err)
		}
		if !ok {
			return nil, fmt.Errorf("no autorizado para importar en este curso")
		}
	}

	fieldMap := buildFieldLookup(req.Mappings)

	// Get currently enrolled students
	enrolledList, err := s.acadRepo.ListEstudiantesByCurso(ctx, cursoID)
	if err != nil {
		return nil, fmt.Errorf("error listando inscritos: %w", err)
	}
	enrolledEmails := map[string]bool{}
	for _, e := range enrolledList {
		enrolledEmails[strings.ToLower(e.Email)] = true
	}

	var enrolled, skippedList, notFound []EnrolledStudent

	for _, row := range req.Rows {
		displayName := extractField(row, fieldMap, "display_name")
		email := extractField(row, fieldMap, "email")
		cedula := normalizeCedula(extractField(row, fieldMap, "cedula"))

		if displayName == "" && email == "" {
			skippedList = append(skippedList, EnrolledStudent{
				DisplayName: displayName,
				Email:       email,
				Status:      "skipped",
				Reason:      "sin nombre ni email",
			})
			continue
		}

		// Try to find the student by email first
		var student *auth.Profile
		if email != "" {
			student, _ = s.authRepo.GetByEmail(ctx, strings.ToLower(strings.TrimSpace(email)))
		}

		// If no email match, try by cedula-based email
		if student == nil && cedula != "" {
			generatedEmail := fmt.Sprintf("%s@%s", sanitizeForEmail(cedula), emailDomain)
			student, _ = s.authRepo.GetByEmail(ctx, generatedEmail)
		}

		if student == nil {
			notFound = append(notFound, EnrolledStudent{
				DisplayName: displayName,
				Email:       email,
				Status:      "not_found",
				Reason:      "estudiante no registrado en la plataforma",
			})
			continue
		}

		// Check if already enrolled
		if enrolledEmails[strings.ToLower(student.Email)] {
			skippedList = append(skippedList, EnrolledStudent{
				DisplayName: ptrToString(student.DisplayName),
				Email:       student.Email,
				Status:      "already_enrolled",
				Reason:      "ya inscrito en el curso",
			})
			continue
		}

		// Enroll
		_, err := s.acadRepo.EnrollStudent(ctx, academic.EstudianteCursoRequest{
			EstudianteID: student.ID,
			CursoID:      cursoID,
		})
		if err != nil {
			skippedList = append(skippedList, EnrolledStudent{
				DisplayName: ptrToString(student.DisplayName),
				Email:       student.Email,
				Status:      "skipped",
				Reason:      "error al inscribir: " + err.Error(),
			})
			continue
		}

		enrolledEmails[strings.ToLower(student.Email)] = true
		enrolled = append(enrolled, EnrolledStudent{
			DisplayName: ptrToString(student.DisplayName),
			Email:       student.Email,
			Status:      "enrolled",
		})
	}

	return &TeacherBulkImportResponse{
		Enrolled: enrolled,
		Skipped:  skippedList,
		NotFound: notFound,
		Total:    len(req.Rows),
	}, nil
}

// ── Helpers ─────────────────────────────────────────────────

func ptrToString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func buildFieldLookup(mappings []FieldMapping) map[string]string {
	// field -> header
	m := map[string]string{}
	for _, fm := range mappings {
		if fm.Field != "ignore" {
			m[fm.Field] = fm.Header
		}
	}
	return m
}

func extractField(row map[string]interface{}, fieldMap map[string]string, field string) string {
	header, ok := fieldMap[field]
	if !ok {
		return ""
	}
	return normalizeCellValue(row[header])
}

func normalizeCellValue(v interface{}) string {
	switch val := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(val)
	case float64:
		return strings.TrimSpace(strconv.FormatFloat(val, 'f', -1, 64))
	case float32:
		return strings.TrimSpace(strconv.FormatFloat(float64(val), 'f', -1, 32))
	case int:
		return strings.TrimSpace(strconv.Itoa(val))
	case int64:
		return strings.TrimSpace(strconv.FormatInt(val, 10))
	case int32:
		return strings.TrimSpace(strconv.FormatInt(int64(val), 10))
	case bool:
		return strings.TrimSpace(strconv.FormatBool(val))
	default:
		return strings.TrimSpace(fmt.Sprint(val))
	}
}

func generatePassword(displayName string, rng *rand.Rand) string {
	firstName := strings.Split(strings.TrimSpace(displayName), " ")[0]
	firstName = strings.ToLower(firstName)
	if firstName == "" {
		firstName = "user"
	}
	// Keep only letters
	clean := strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) {
			return unicode.ToLower(r)
		}
		return -1
	}, firstName)
	if clean == "" {
		clean = "user"
	}
	return fmt.Sprintf("%s%04d", clean, rng.Intn(10000))
}

func sanitizeForEmail(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, " ", ".")
	var result strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '.' || r == '-' || r == '_' {
			result.WriteRune(r)
		}
	}
	return result.String()
}

func normalizeCedula(s string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(s) {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func buildCandidateEmails(displayName, email, cedula string) []string {
	seen := map[string]bool{}
	var out []string
	add := func(v string) {
		v = strings.ToLower(strings.TrimSpace(v))
		if v == "" || seen[v] {
			return
		}
		seen[v] = true
		out = append(out, v)
	}

	if email != "" {
		add(email)
	}
	if cedula != "" {
		add(fmt.Sprintf("%s@%s", sanitizeForEmail(cedula), emailDomain))
	}
	if displayName != "" {
		add(fmt.Sprintf("%s@%s", sanitizeForEmail(displayName), emailDomain))
	}

	return out
}

func buildIdentityKey(displayName, email, cedula, phone string) string {
	if cedula != "" {
		return "cedula:" + cedula
	}
	if email != "" {
		return "email:" + strings.ToLower(strings.TrimSpace(email))
	}
	if displayName == "" || phone == "" {
		return ""
	}
	nameKey := strings.ToLower(strings.Join(strings.Fields(displayName), " "))
	if phone != "" {
		return "name_phone:" + nameKey + ":" + strings.ToLower(strings.TrimSpace(phone))
	}
	return ""
}

func (s *Service) generateUniqueEmail(ctx context.Context, base string) (string, error) {
	base = strings.ToLower(strings.TrimSpace(base))
	if base == "" {
		return "", fmt.Errorf("empty base email")
	}

	local := base
	domain := emailDomain
	if at := strings.LastIndex(base, "@"); at > 0 && at < len(base)-1 {
		local = base[:at]
		domain = base[at+1:]
	}

	for i := 0; i < 1000; i++ {
		candidate := fmt.Sprintf("%s@%s", local, domain)
		if i > 0 {
			candidate = fmt.Sprintf("%s.%d@%s", local, i+1, domain)
		}

		existing, _ := s.authRepo.GetByEmail(ctx, candidate)
		if existing == nil {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("no available email candidate")
}
