package jwt

import (
	"fmt"
	"time"

	gojwt "github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	gojwt.RegisteredClaims
	Role     string `json:"role"`
	UserRole string `json:"user_role"`
	Email    string `json:"email"`
}

type Service struct {
	secret      []byte
	expireHours int
}

func NewService(secret string, expireHours int) *Service {
	return &Service{
		secret:      []byte(secret),
		expireHours: expireHours,
	}
}

func (s *Service) Generate(userID, role, email string) (string, error) {
	now := time.Now()
	claims := Claims{
		RegisteredClaims: gojwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  gojwt.NewNumericDate(now),
			ExpiresAt: gojwt.NewNumericDate(now.Add(time.Duration(s.expireHours) * time.Hour)),
		},
		Role:     "authenticated",
		UserRole: role,
		Email:    email,
	}

	token := gojwt.NewWithClaims(gojwt.SigningMethodHS256, claims)
	return token.SignedString(s.secret)
}

func (s *Service) Validate(tokenStr string) (*Claims, error) {
	token, err := gojwt.ParseWithClaims(tokenStr, &Claims{}, func(t *gojwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*gojwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.secret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	return claims, nil
}
