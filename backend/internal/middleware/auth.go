package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/arcanea/backend/internal/jwt"
	"github.com/arcanea/backend/internal/shared"
)

type contextKey string

const (
	ClaimsKey contextKey = "claims"
)

func Auth(jwtSvc *jwt.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if header == "" {
				shared.Error(w, http.StatusUnauthorized, "Token requerido")
				return
			}

			parts := strings.SplitN(header, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				shared.Error(w, http.StatusUnauthorized, "Formato de token inválido")
				return
			}

			claims, err := jwtSvc.Validate(parts[1])
			if err != nil {
				shared.Error(w, http.StatusUnauthorized, "Token inválido o expirado")
				return
			}

			ctx := context.WithValue(r.Context(), ClaimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func GetClaims(ctx context.Context) *jwt.Claims {
	if c, ok := ctx.Value(ClaimsKey).(*jwt.Claims); ok {
		return c
	}
	return nil
}

func RequireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := GetClaims(r.Context())
			if claims == nil {
				shared.Error(w, http.StatusUnauthorized, "No autenticado")
				return
			}
			if !allowed[claims.UserRole] {
				shared.Error(w, http.StatusForbidden, "No tienes permisos para esta acción")
				return
			}
			next.ServeHTTP(w, r.WithContext(r.Context()))
		})
	}
}
