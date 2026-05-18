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
	secret              []byte
	accessExpireMinutes int
}

func NewService(secret string, accessExpireMinutes int) *Service {
	if accessExpireMinutes <= 0 {
		accessExpireMinutes = 15
	}

	return &Service{
		secret:              []byte(secret),
		accessExpireMinutes: accessExpireMinutes,
	}
}

func (s *Service) AccessTokenTTL() time.Duration {
	return time.Duration(s.accessExpireMinutes) * time.Minute
}

func (s *Service) Generate(userID, role, email string) (string, time.Time, error) {
	return s.GenerateWithTTL(userID, role, email, s.AccessTokenTTL())
}

func (s *Service) GenerateWithTTL(userID, role, email string, ttl time.Duration) (string, time.Time, error) {
	if ttl <= 0 {
		ttl = s.AccessTokenTTL()
	}

	now := time.Now()
	expiresAt := now.Add(ttl)
	claims := Claims{
		RegisteredClaims: gojwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  gojwt.NewNumericDate(now),
			ExpiresAt: gojwt.NewNumericDate(expiresAt),
		},
		Role:     "authenticated",
		UserRole: role,
		Email:    email,
	}

	token := gojwt.NewWithClaims(gojwt.SigningMethodHS256, claims)
	signedToken, err := token.SignedString(s.secret)
	if err != nil {
		return "", time.Time{}, err
	}
	return signedToken, expiresAt, nil
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
