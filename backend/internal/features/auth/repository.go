package auth

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) GetByEmail(ctx context.Context, email string) (*Profile, string, error) {
	var p Profile
	var passwordHash string
	err := r.db.QueryRow(ctx, `
		SELECT id, email, password_hash, role, display_name, phone,
		       role_requested, is_verified, avatar_url, created_by, created_at, updated_at
		FROM internal.profiles WHERE email = lower(trim($1))
	`, email).Scan(
		&p.ID, &p.Email, &passwordHash, &p.Role, &p.DisplayName, &p.Phone,
		&p.RoleRequested, &p.IsVerified, &p.AvatarURL, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, "", err
	}
	return &p, passwordHash, nil
}

func (r *Repository) GetByID(ctx context.Context, id string) (*Profile, error) {
	var p Profile
	err := r.db.QueryRow(ctx, `
		SELECT id, email, role, display_name, phone,
		       role_requested, is_verified, avatar_url, created_by, created_at, updated_at
		FROM internal.profiles WHERE id = $1
	`, id).Scan(
		&p.ID, &p.Email, &p.Role, &p.DisplayName, &p.Phone,
		&p.RoleRequested, &p.IsVerified, &p.AvatarURL, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) Create(ctx context.Context, email, passwordHash string, displayName, phone *string, roleRequested *string) (*Profile, error) {
	var p Profile
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.profiles (email, password_hash, display_name, phone, role_requested)
		VALUES (lower(trim($1)), $2, $3, $4,
			CASE WHEN $5 IN ('teacher', 'resource_manager') THEN $5::internal.user_role ELSE NULL END
		)
		RETURNING id, email, role, display_name, phone, role_requested, is_verified, avatar_url, created_by, created_at, updated_at
	`, email, passwordHash, displayName, phone, roleRequested).Scan(
		&p.ID, &p.Email, &p.Role, &p.DisplayName, &p.Phone,
		&p.RoleRequested, &p.IsVerified, &p.AvatarURL, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) CreateAdmin(ctx context.Context, email, passwordHash string, displayName *string, createdBy string) (*Profile, error) {
	var p Profile
	err := r.db.QueryRow(ctx, `
		INSERT INTO internal.profiles (email, password_hash, role, display_name, is_verified, created_by)
		VALUES (lower(trim($1)), $2, 'admin', $3, TRUE, $4)
		RETURNING id, email, role, display_name, phone, role_requested, is_verified, avatar_url, created_by, created_at, updated_at
	`, email, passwordHash, displayName, createdBy).Scan(
		&p.ID, &p.Email, &p.Role, &p.DisplayName, &p.Phone,
		&p.RoleRequested, &p.IsVerified, &p.AvatarURL, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) UpdateRole(ctx context.Context, userID, newRole string) (*Profile, error) {
	var p Profile
	err := r.db.QueryRow(ctx, `
		UPDATE internal.profiles SET role = $2::internal.user_role
		WHERE id = $1
		RETURNING id, email, role, display_name, phone, role_requested, is_verified, avatar_url, created_by, created_at, updated_at
	`, userID, newRole).Scan(
		&p.ID, &p.Email, &p.Role, &p.DisplayName, &p.Phone,
		&p.RoleRequested, &p.IsVerified, &p.AvatarURL, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) UpdateProfile(ctx context.Context, userID string, req UpdateProfileRequest) (*Profile, error) {
	var p Profile
	err := r.db.QueryRow(ctx, `
		UPDATE internal.profiles
		SET display_name = COALESCE($2, display_name),
		    phone = COALESCE($3, phone),
		    avatar_url = COALESCE($4, avatar_url)
		WHERE id = $1
		RETURNING id, email, role, display_name, phone, role_requested, is_verified, avatar_url, created_by, created_at, updated_at
	`, userID, req.DisplayName, req.Phone, req.AvatarURL).Scan(
		&p.ID, &p.Email, &p.Role, &p.DisplayName, &p.Phone,
		&p.RoleRequested, &p.IsVerified, &p.AvatarURL, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) UpdateLastAccess(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `UPDATE internal.profiles SET updated_at = now() WHERE id = $1`, userID)
	return err
}

func (r *Repository) ListAll(ctx context.Context) ([]Profile, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, email, role, display_name, phone, role_requested, is_verified, avatar_url, created_by, created_at, updated_at
		FROM internal.profiles ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var profiles []Profile
	for rows.Next() {
		var p Profile
		if err := rows.Scan(
			&p.ID, &p.Email, &p.Role, &p.DisplayName, &p.Phone,
			&p.RoleRequested, &p.IsVerified, &p.AvatarURL, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			return nil, err
		}
		profiles = append(profiles, p)
	}
	return profiles, nil
}

func (r *Repository) ApproveRoleRequest(ctx context.Context, userID string) (*Profile, error) {
	var p Profile
	err := r.db.QueryRow(ctx, `
		UPDATE internal.profiles SET role = role_requested, role_requested = NULL
		WHERE id = $1 AND role_requested IS NOT NULL
		RETURNING id, email, role, display_name, phone, role_requested, is_verified, avatar_url, created_by, created_at, updated_at
	`, userID).Scan(
		&p.ID, &p.Email, &p.Role, &p.DisplayName, &p.Phone,
		&p.RoleRequested, &p.IsVerified, &p.AvatarURL, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("no pending role request for user: %w", err)
	}
	return &p, nil
}

func (r *Repository) RejectRoleRequest(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `UPDATE internal.profiles SET role_requested = NULL WHERE id = $1`, userID)
	return err
}

func (r *Repository) Delete(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM internal.profiles WHERE id = $1`, userID)
	return err
}

func (r *Repository) SetVerificationToken(ctx context.Context, userID, token string, expiry time.Time) error {
	_, err := r.db.Exec(ctx, `
		UPDATE internal.profiles SET verification_token = $2, token_expiry = $3 WHERE id = $1
	`, userID, token, expiry)
	return err
}

func (r *Repository) GetByVerificationToken(ctx context.Context, token string) (*Profile, error) {
	var p Profile
	var expiry *time.Time
	err := r.db.QueryRow(ctx, `
		SELECT id, email, role, display_name, phone,
		       role_requested, is_verified, avatar_url, created_by, created_at, updated_at, token_expiry
		FROM internal.profiles WHERE verification_token = $1
	`, token).Scan(
		&p.ID, &p.Email, &p.Role, &p.DisplayName, &p.Phone,
		&p.RoleRequested, &p.IsVerified, &p.AvatarURL, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt, &expiry,
	)
	if err != nil {
		return nil, err
	}
	if expiry == nil || time.Now().After(*expiry) {
		return nil, fmt.Errorf("token expirado")
	}
	return &p, nil
}

func (r *Repository) MarkVerified(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE internal.profiles SET is_verified = TRUE, verification_token = NULL, token_expiry = NULL WHERE id = $1
	`, userID)
	return err
}
