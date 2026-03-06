package auth

import "time"

type Profile struct {
	ID            string    `json:"id"`
	Email         string    `json:"email"`
	Role          string    `json:"role"`
	DisplayName   *string   `json:"display_name"`
	Phone         *string   `json:"phone"`
	RoleRequested *string   `json:"role_requested"`
	IsVerified    bool      `json:"is_verified"`
	AvatarURL     *string   `json:"avatar_url"`
	CreatedBy     *string   `json:"created_by"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type RegisterRequest struct {
	Email         string  `json:"email"`
	Password      string  `json:"password"`
	DisplayName   *string `json:"display_name"`
	Phone         *string `json:"phone"`
	RoleRequested *string `json:"role_requested"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type TokenResponse struct {
	Token string  `json:"token"`
	User  Profile `json:"user"`
}

type RegisterResponse struct {
	Message string  `json:"message"`
	User    Profile `json:"user"`
}

type ResendVerificationRequest struct {
	Email string `json:"email"`
}

type CreateAdminRequest struct {
	Email       string  `json:"email"`
	Password    string  `json:"password"`
	DisplayName *string `json:"display_name"`
}

type ChangeRoleRequest struct {
	UserID  string `json:"user_id"`
	NewRole string `json:"new_role"`
}

type UpdateProfileRequest struct {
	DisplayName *string `json:"display_name"`
	Phone       *string `json:"phone"`
	AvatarURL   *string `json:"avatar_url"`
}
