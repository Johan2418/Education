package auth

import (
	"context"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) GetByEmail(ctx context.Context, email string) (*Profile, error) {
	var p Profile
	err := r.db.WithContext(ctx).
		Where("email = lower(trim(?))", email).
		First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) GetByID(ctx context.Context, id string) (*Profile, error) {
	var p Profile
	err := r.db.WithContext(ctx).
		Where("id = ?", id).
		First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) Create(ctx context.Context, email, passwordHash string, displayName, phone *string, roleRequested *string) (*Profile, error) {
	var rr *string
	if roleRequested != nil {
		r := *roleRequested
		if r == "teacher" || r == "resource_manager" {
			rr = &r
		}
	}

	p := Profile{
		Email:         strings.ToLower(strings.TrimSpace(email)),
		PasswordHash:  passwordHash,
		DisplayName:   displayName,
		Phone:         phone,
		RoleRequested: rr,
	}

	if err := r.db.WithContext(ctx).Create(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) CreateAdmin(ctx context.Context, email, passwordHash string, displayName *string, createdBy string) (*Profile, error) {
	role := "admin"
	p := Profile{
		Email:        strings.ToLower(strings.TrimSpace(email)),
		PasswordHash: passwordHash,
		Role:         role,
		DisplayName:  displayName,
		IsVerified:   true,
		CreatedBy:    &createdBy,
	}

	if err := r.db.WithContext(ctx).Create(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) UpdateRole(ctx context.Context, userID, newRole string) (*Profile, error) {
	var p Profile
	err := r.db.WithContext(ctx).
		Model(&p).
		Where("id = ?", userID).
		Update("role", gorm.Expr("?::internal.user_role", newRole)).
		Error
	if err != nil {
		return nil, err
	}
	return r.GetByID(ctx, userID)
}

func (r *Repository) UpdateProfile(ctx context.Context, userID string, req UpdateProfileRequest) (*Profile, error) {
	updates := map[string]interface{}{}
	if req.DisplayName != nil {
		updates["display_name"] = *req.DisplayName
	}
	if req.Phone != nil {
		updates["phone"] = *req.Phone
	}
	if req.AvatarURL != nil {
		updates["avatar_url"] = *req.AvatarURL
	}

	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&Profile{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
			return nil, err
		}
	}

	return r.GetByID(ctx, userID)
}

func (r *Repository) UpdateLastAccess(ctx context.Context, userID string) error {
	return r.db.WithContext(ctx).
		Model(&Profile{}).
		Where("id = ?", userID).
		Update("updated_at", time.Now()).Error
}

func (r *Repository) ListAll(ctx context.Context) ([]Profile, error) {
	var profiles []Profile
	err := r.db.WithContext(ctx).Order("created_at DESC").Find(&profiles).Error
	return profiles, err
}

func (r *Repository) ListStudents(ctx context.Context) ([]Profile, error) {
	var profiles []Profile
	err := r.db.WithContext(ctx).
		Where("role = ?::internal.user_role", "student").
		Order("display_name, email").
		Find(&profiles).Error
	return profiles, err
}

func (r *Repository) ApproveRoleRequest(ctx context.Context, userID string) (*Profile, error) {
	result := r.db.WithContext(ctx).
		Model(&Profile{}).
		Where("id = ? AND role_requested IS NOT NULL", userID).
		Updates(map[string]interface{}{
			"role":           gorm.Expr("role_requested"),
			"role_requested": nil,
		})
	if result.Error != nil {
		return nil, fmt.Errorf("no pending role request for user: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, fmt.Errorf("no pending role request for user")
	}
	return r.GetByID(ctx, userID)
}

func (r *Repository) RejectRoleRequest(ctx context.Context, userID string) error {
	return r.db.WithContext(ctx).
		Model(&Profile{}).
		Where("id = ?", userID).
		Update("role_requested", nil).Error
}

func (r *Repository) Delete(ctx context.Context, userID string) error {
	return r.db.WithContext(ctx).Where("id = ?", userID).Delete(&Profile{}).Error
}

func (r *Repository) SetVerificationToken(ctx context.Context, userID, token string, expiry time.Time) error {
	return r.db.WithContext(ctx).
		Model(&Profile{}).
		Where("id = ?", userID).
		Updates(map[string]interface{}{
			"verification_token": token,
			"token_expiry":       expiry,
		}).Error
}

func (r *Repository) GetByVerificationToken(ctx context.Context, token string) (*Profile, error) {
	var p Profile
	err := r.db.WithContext(ctx).
		Where("verification_token = ?", token).
		First(&p).Error
	if err != nil {
		return nil, err
	}
	if p.TokenExpiry == nil || time.Now().After(*p.TokenExpiry) {
		return nil, fmt.Errorf("token expirado")
	}
	return &p, nil
}

func (r *Repository) MarkVerified(ctx context.Context, userID string) error {
	return r.db.WithContext(ctx).
		Model(&Profile{}).
		Where("id = ?", userID).
		Updates(map[string]interface{}{
			"is_verified":        true,
			"verification_token": nil,
			"token_expiry":       nil,
		}).Error
}
