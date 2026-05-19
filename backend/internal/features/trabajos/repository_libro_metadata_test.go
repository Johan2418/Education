package trabajos

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestListTrabajosByLeccionIncludesLibroExtractionMetadata(t *testing.T) {
	db, mock := newTrabajosMockDB(t)
	repo := NewRepository(db)
	now := time.Now()

	mock.ExpectQuery(regexp.MustCompile(`SELECT(?s).*libro_extraccion_estado.*libro_extraccion_confirmado.*libro_revision_manual_pendiente.*FROM internal\.trabajo tr.*WHERE tr\.leccion_id = \$1`).String()).
		WithArgs("leccion-1").
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"leccion_id",
			"titulo",
			"estado",
			"extraido_de_libro",
			"id_extraccion",
			"tipo_trabajo",
			"permite_archivo",
			"permite_entrega_tardia",
			"calificacion_automatica",
			"configuracion_calificacion",
			"nota_maxima",
			"peso_calificacion",
			"created_at",
			"updated_at",
			"libro_extraccion_estado",
			"libro_extraccion_confirmado",
			"libro_revision_manual_pendiente",
		}).AddRow(
			"trabajo-1",
			"leccion-1",
			"Trabajo de prueba",
			"borrador",
			true,
			"ext-1",
			"preguntas",
			false,
			false,
			false,
			[]byte(`{}`),
			10.0,
			1.0,
			now,
			now,
			"aprobado",
			true,
			false,
		))

	items, err := repo.ListTrabajosByLeccion(context.Background(), "leccion-1")
	if err != nil {
		t.Fatalf("ListTrabajosByLeccion returned error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected one item, got %d", len(items))
	}
	got := items[0]
	if got.LibroExtraccionEstado == nil || *got.LibroExtraccionEstado != "aprobado" {
		t.Fatalf("expected libro_extraccion_estado=aprobado, got %+v", got.LibroExtraccionEstado)
	}
	if got.LibroExtraccionConfirmado == nil || !*got.LibroExtraccionConfirmado {
		t.Fatalf("expected libro_extraccion_confirmado=true, got %+v", got.LibroExtraccionConfirmado)
	}
	if got.LibroRevisionManualPendiente == nil || *got.LibroRevisionManualPendiente {
		t.Fatalf("expected libro_revision_manual_pendiente=false, got %+v", got.LibroRevisionManualPendiente)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func newTrabajosMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
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
