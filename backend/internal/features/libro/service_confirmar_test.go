package libro

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestConfirmarLibroWithoutPublishKeepsTrabajoAsDraft(t *testing.T) {
	db, mock := newLibroMockDB(t)
	repo := NewRepository(db)
	svc := NewService(repo, &AIService{model: "analysis"}, &AIService{model: "mcp"})

	trabajoID := "trabajo-1"
	userID := "admin-1"
	now := time.Now()

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "internal"."trabajo" WHERE id = $1 ORDER BY "trabajo"."id" LIMIT $2`)).
		WithArgs(trabajoID, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "estado", "nota_maxima", "extraido_de_libro", "id_extraccion"}).
			AddRow(trabajoID, "borrador", 10.0, true, "ext-1"))

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "internal"."libro_extraccion" WHERE trabajo_id = $1 ORDER BY "libro_extraccion"."id" LIMIT $2`)).
		WithArgs(trabajoID, 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "trabajo_id", "estado", "confirmado_por", "updated_at",
		}).AddRow("ext-1", trabajoID, "aprobado", nil, now))

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "internal"."trabajo_pregunta" WHERE trabajo_id = $1 ORDER BY orden ASC, created_at ASC`)).
		WithArgs(trabajoID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "trabajo_id", "texto", "tipo", "opciones", "puntaje_maximo", "orden"}).
			AddRow("q1", trabajoID, "¿Pregunta?", "respuesta_corta", []byte("[]"), 1.0, 1))

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.MustCompile(`INSERT INTO "internal"\."libro_extraccion".*ON CONFLICT.*`).String()).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("ext-1"))
	mock.ExpectCommit()

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "internal"."libro_extraccion" WHERE trabajo_id = $1 ORDER BY "libro_extraccion"."id" LIMIT $2`)).
		WithArgs(trabajoID, 1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "trabajo_id", "estado", "confirmado_por", "updated_at",
		}).AddRow("ext-1", trabajoID, "aprobado", userID, now))

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "internal"."trabajo" WHERE id = $1 ORDER BY "trabajo"."id" LIMIT $2`)).
		WithArgs(trabajoID, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "estado", "nota_maxima", "extraido_de_libro", "id_extraccion"}).
			AddRow(trabajoID, "borrador", 10.0, true, "ext-1"))

	resp, err := svc.ConfirmarLibro(
		context.Background(),
		trabajoID,
		ConfirmarLibroRequest{Publicar: false},
		userID,
		"admin",
	)
	if err != nil {
		t.Fatalf("ConfirmarLibro returned error: %v", err)
	}
	if resp == nil || resp.Trabajo == nil || resp.Extraccion == nil {
		t.Fatalf("expected non-nil response with trabajo and extraccion")
	}
	if resp.Trabajo.Estado != "borrador" {
		t.Fatalf("expected trabajo to remain borrador, got %q", resp.Trabajo.Estado)
	}
	if resp.Extraccion.ConfirmadoPor == nil || *resp.Extraccion.ConfirmadoPor != userID {
		t.Fatalf("expected confirmado_por to be set to %q, got %+v", userID, resp.Extraccion.ConfirmadoPor)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func newLibroMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()
	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}

	db, err := gorm.Open(postgres.New(postgres.Config{
		Conn:                 sqlDB,
		PreferSimpleProtocol: true,
	}), &gorm.Config{})
	if err != nil {
		t.Fatalf("gorm.Open: %v", err)
	}
	return db, mock
}
