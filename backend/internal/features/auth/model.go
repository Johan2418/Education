package auth

import "time"

type Profile struct {
	ID                string     `json:"id" gorm:"column:id;primaryKey;default:gen_random_uuid()"`
	Email             string     `json:"email" gorm:"column:email;uniqueIndex"`
	PasswordHash      string     `json:"-" gorm:"column:password_hash"`
	Role              string     `json:"role" gorm:"column:role;type:internal.user_role;default:'student'"`
	DisplayName       *string    `json:"display_name" gorm:"column:display_name"`
	Phone             *string    `json:"phone" gorm:"column:phone"`
	RoleRequested     *string    `json:"role_requested" gorm:"column:role_requested;type:internal.user_role"`
	IsVerified        bool       `json:"is_verified" gorm:"column:is_verified;default:false"`
	AvatarURL         *string    `json:"avatar_url" gorm:"column:avatar_url"`
	CreatedBy         *string    `json:"created_by" gorm:"column:created_by"`
	VerificationToken *string    `json:"-" gorm:"column:verification_token"`
	TokenExpiry       *time.Time `json:"-" gorm:"column:token_expiry"`
	CreatedAt         time.Time  `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt         time.Time  `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

func (Profile) TableName() string { return "internal.profiles" }

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
