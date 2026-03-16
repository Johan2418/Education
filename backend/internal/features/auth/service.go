package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/arcanea/backend/internal/email"
	"github.com/arcanea/backend/internal/jwt"
)

type Service struct {
	repo     *Repository
	jwtSvc   *jwt.Service
	emailSvc *email.Service
}

func NewService(repo *Repository, jwtSvc *jwt.Service, emailSvc *email.Service) *Service {
	return &Service{repo: repo, jwtSvc: jwtSvc, emailSvc: emailSvc}
}

func (s *Service) Register(ctx context.Context, req RegisterRequest) (*RegisterResponse, error) {
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" {
		return nil, errors.New("el email es obligatorio")
	}
	if len(req.Password) < 8 {
		return nil, errors.New("la contraseña debe tener al menos 8 caracteres")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, errors.New("error procesando contraseña")
	}

	var roleReq *string
	if req.RoleRequested != nil {
		r := *req.RoleRequested
		if r == "teacher" || r == "resource_manager" {
			roleReq = &r
		}
	}

	user, err := s.repo.Create(ctx, email, string(hash), req.DisplayName, req.Phone, roleReq)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique") {
			return nil, errors.New("el email ya está registrado")
		}
		return nil, errors.New("error creando usuario")
	}

	// Generate verification token and send email
	token := uuid.New().String()
	expiry := time.Now().Add(24 * time.Hour)
	if err := s.repo.SetVerificationToken(ctx, user.ID, token, expiry); err != nil {
		return nil, errors.New("error configurando verificación")
	}

	if err := s.emailSvc.SendVerificationEmail(email, token); err != nil {
		// Log but don't fail registration — user can request resend
		_ = err
	}

	return &RegisterResponse{
		Message: "Registro exitoso. Revisa tu correo para verificar tu cuenta.",
		User:    *user,
	}, nil
}

func (s *Service) Login(ctx context.Context, req LoginRequest) (*TokenResponse, error) {
	user, err := s.repo.GetByEmail(ctx, req.Email)
	if err != nil {
		return nil, errors.New("credenciales inválidas")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, errors.New("credenciales inválidas")
	}

	// TODO: re-enable when email verification is mandatory
	// if !user.IsVerified {
	// 	return nil, errors.New("cuenta no verificada")
	// }

	_ = s.repo.UpdateLastAccess(ctx, user.ID)

	token, err := s.jwtSvc.Generate(user.ID, user.Role, user.Email)
	if err != nil {
		return nil, errors.New("error generando token")
	}

	return &TokenResponse{Token: token, User: *user}, nil
}

func (s *Service) Me(ctx context.Context, userID string) (*Profile, error) {
	return s.repo.GetByID(ctx, userID)
}

func (s *Service) UpdateProfile(ctx context.Context, userID string, req UpdateProfileRequest) (*Profile, error) {
	return s.repo.UpdateProfile(ctx, userID, req)
}

func (s *Service) CreateAdmin(ctx context.Context, req CreateAdminRequest, callerRole, callerID string) (*Profile, error) {
	if callerRole != "admin" && callerRole != "super_admin" {
		return nil, errors.New("solo un administrador puede crear usuarios")
	}
	if len(req.Password) < 8 {
		return nil, errors.New("la contraseña debe tener al menos 8 caracteres")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, errors.New("error procesando contraseña")
	}

	return s.repo.CreateAdmin(ctx, req.Email, string(hash), req.DisplayName, callerID)
}

func (s *Service) ChangeRole(ctx context.Context, req ChangeRoleRequest, callerRole string) (*Profile, error) {
	validRoles := map[string]bool{
		"student": true, "teacher": true, "resource_manager": true, "admin": true,
	}
	if !validRoles[req.NewRole] {
		return nil, errors.New("rol inválido")
	}
	if req.NewRole == "admin" && callerRole != "super_admin" {
		return nil, errors.New("solo un super_admin puede asignar el rol admin")
	}
	if callerRole != "admin" && callerRole != "super_admin" {
		return nil, errors.New("no tienes permisos para cambiar roles")
	}

	// Prevent admin from modifying a super_admin
	target, err := s.repo.GetByID(ctx, req.UserID)
	if err != nil {
		return nil, errors.New("usuario no encontrado")
	}
	if target.Role == "super_admin" && callerRole != "super_admin" {
		return nil, errors.New("no puedes modificar a un super administrador")
	}

	return s.repo.UpdateRole(ctx, req.UserID, req.NewRole)
}

func (s *Service) ListUsers(ctx context.Context) ([]Profile, error) {
	return s.repo.ListAll(ctx)
}

func (s *Service) ListStudents(ctx context.Context) ([]Profile, error) {
	return s.repo.ListStudents(ctx)
}

func (s *Service) GetUser(ctx context.Context, userID string) (*Profile, error) {
	return s.repo.GetByID(ctx, userID)
}

func (s *Service) ApproveRoleRequest(ctx context.Context, userID string) (*Profile, error) {
	return s.repo.ApproveRoleRequest(ctx, userID)
}

func (s *Service) RejectRoleRequest(ctx context.Context, userID string) error {
	return s.repo.RejectRoleRequest(ctx, userID)
}

func (s *Service) DeleteUser(ctx context.Context, userID, callerRole string) error {
	target, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return errors.New("usuario no encontrado")
	}
	if target.Role == "super_admin" {
		return errors.New("no se puede eliminar a un super administrador")
	}
	if target.Role == "admin" && callerRole != "super_admin" {
		return errors.New("solo un super_admin puede eliminar administradores")
	}
	return s.repo.Delete(ctx, userID)
}

func (s *Service) VerifyEmail(ctx context.Context, token string) error {
	if token == "" {
		return errors.New("token requerido")
	}
	user, err := s.repo.GetByVerificationToken(ctx, token)
	if err != nil {
		return errors.New("token inválido o expirado")
	}
	if user.IsVerified {
		return nil // already verified
	}
	return s.repo.MarkVerified(ctx, user.ID)
}

func (s *Service) ResendVerification(ctx context.Context, emailAddr string) error {
	emailAddr = strings.TrimSpace(strings.ToLower(emailAddr))
	if emailAddr == "" {
		return errors.New("el email es obligatorio")
	}
	user, err := s.repo.GetByEmail(ctx, emailAddr)
	if err != nil {
		return errors.New("email no encontrado")
	}
	if user.IsVerified {
		return errors.New("la cuenta ya está verificada")
	}
	token := uuid.New().String()
	expiry := time.Now().Add(24 * time.Hour)
	if err := s.repo.SetVerificationToken(ctx, user.ID, token, expiry); err != nil {
		return errors.New("error configurando verificación")
	}
	return s.emailSvc.SendVerificationEmail(emailAddr, token)
}
