package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/arcanea/backend/internal/email"
	"github.com/arcanea/backend/internal/jwt"
)

type Service struct {
	repo               *Repository
	jwtSvc             *jwt.Service
	emailSvc           *email.Service
	sessionExpireHours int
}

func NewService(repo *Repository, jwtSvc *jwt.Service, emailSvc *email.Service, sessionExpireHours int) *Service {
	if sessionExpireHours <= 0 {
		sessionExpireHours = 24
	}

	return &Service{
		repo:               repo,
		jwtSvc:             jwtSvc,
		emailSvc:           emailSvc,
		sessionExpireHours: sessionExpireHours,
	}
}

func (s *Service) Register(ctx context.Context, req RegisterRequest) (*RegisterResponse, error) {
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" {
		return nil, errors.New("el email es obligatorio")
	}
	if len(req.Password) < 8 {
		return nil, errors.New("la contrasena debe tener al menos 8 caracteres")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, errors.New("error procesando contrasena")
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
			return nil, errors.New("el email ya esta registrado")
		}
		return nil, errors.New("error creando usuario")
	}

	// Generate verification token and send email
	token := uuid.New().String()
	expiry := time.Now().Add(24 * time.Hour)
	if err := s.repo.SetVerificationToken(ctx, user.ID, token, expiry); err != nil {
		return nil, errors.New("error configurando verificacion")
	}

	if err := s.emailSvc.SendVerificationEmail(email, token); err != nil {
		// Log but do not fail registration; user can request resend.
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
		return nil, errors.New("credenciales invalidas")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, errors.New("credenciales invalidas")
	}

	// TODO: re-enable when email verification is mandatory
	// if !user.IsVerified {
	// 	return nil, errors.New("cuenta no verificada")
	// }

	_ = s.repo.UpdateLastAccess(ctx, user.ID)

	accessToken, accessExpiresAt, err := s.jwtSvc.Generate(user.ID, user.Role, user.Email)
	if err != nil {
		return nil, errors.New("error generando token")
	}

	refreshToken, err := generateRefreshToken()
	if err != nil {
		return nil, errors.New("error generando sesion")
	}

	session := AuthSession{
		UserID:           user.ID,
		RefreshTokenHash: hashToken(refreshToken),
		RememberMe:       req.RememberMe,
		ExpiresAt:        s.sessionExpiresAt(req.RememberMe),
	}
	if _, err := s.repo.CreateAuthSession(ctx, session); err != nil {
		return nil, errors.New("error creando sesion")
	}

	return &TokenResponse{
		Token:           accessToken,
		AccessToken:     accessToken,
		RefreshToken:    refreshToken,
		AccessExpiresAt: accessExpiresAt,
		User:            *user,
		Profile:         *user,
	}, nil
}

func (s *Service) Refresh(ctx context.Context, req RefreshRequest) (*TokenResponse, error) {
	refreshToken := strings.TrimSpace(req.RefreshToken)
	if refreshToken == "" {
		return nil, errors.New("refresh_token requerido")
	}

	session, err := s.repo.GetAuthSessionByHash(ctx, hashToken(refreshToken))
	if err != nil {
		return nil, errors.New("error validando sesion")
	}
	if session == nil || session.RevokedAt != nil {
		return nil, errors.New("sesion invalida")
	}

	now := time.Now()
	if session.ExpiresAt != nil && now.After(*session.ExpiresAt) {
		_ = s.repo.RevokeAuthSessionByHash(ctx, hashToken(refreshToken), now)
		return nil, errors.New("sesion expirada")
	}

	user, err := s.repo.GetByID(ctx, session.UserID)
	if err != nil {
		return nil, errors.New("sesion invalida")
	}

	accessToken, accessExpiresAt, err := s.jwtSvc.Generate(user.ID, user.Role, user.Email)
	if err != nil {
		return nil, errors.New("error renovando token")
	}

	newRefreshToken, err := generateRefreshToken()
	if err != nil {
		return nil, errors.New("error renovando sesion")
	}

	if err := s.repo.RotateAuthSessionToken(ctx, session.ID, hashToken(newRefreshToken), now); err != nil {
		return nil, errors.New("error actualizando sesion")
	}

	return &TokenResponse{
		Token:           accessToken,
		AccessToken:     accessToken,
		RefreshToken:    newRefreshToken,
		AccessExpiresAt: accessExpiresAt,
		User:            *user,
		Profile:         *user,
	}, nil
}

func (s *Service) Logout(ctx context.Context, req LogoutRequest) error {
	refreshToken := strings.TrimSpace(req.RefreshToken)
	if refreshToken == "" {
		return nil
	}

	if err := s.repo.RevokeAuthSessionByHash(ctx, hashToken(refreshToken), time.Now()); err != nil {
		return errors.New("error cerrando sesion")
	}

	return nil
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
		return nil, errors.New("la contrasena debe tener al menos 8 caracteres")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, errors.New("error procesando contrasena")
	}

	return s.repo.CreateAdmin(ctx, req.Email, string(hash), req.DisplayName, callerID)
}

func (s *Service) ChangeRole(ctx context.Context, req ChangeRoleRequest, callerRole string) (*Profile, error) {
	validRoles := map[string]bool{
		"student": true, "teacher": true, "resource_manager": true, "admin": true,
	}
	if !validRoles[req.NewRole] {
		return nil, errors.New("rol invalido")
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
		return errors.New("token invalido o expirado")
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
		return errors.New("la cuenta ya esta verificada")
	}
	token := uuid.New().String()
	expiry := time.Now().Add(24 * time.Hour)
	if err := s.repo.SetVerificationToken(ctx, user.ID, token, expiry); err != nil {
		return errors.New("error configurando verificacion")
	}
	return s.emailSvc.SendVerificationEmail(emailAddr, token)
}

func (s *Service) sessionExpiresAt(rememberMe bool) *time.Time {
	if rememberMe {
		return nil
	}
	exp := time.Now().Add(time.Duration(s.sessionExpireHours) * time.Hour)
	return &exp
}

func generateRefreshToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func hashToken(value string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(value)))
	return hex.EncodeToString(sum[:])
}
