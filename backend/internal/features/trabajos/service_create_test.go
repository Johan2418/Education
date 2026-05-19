package trabajos

import (
	"context"
	"regexp"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestCreateTrabajoWithMateriaIDCreatesSuccessfully(t *testing.T) {
	db, mock := newTrabajosServiceMockDB(t)
	repo := NewRepository(db)
	svc := NewService(repo, nil, nil)

	materiaID := "mat-1"
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.MustCompile(`INSERT INTO "internal"\."trabajo"`).String()).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("trabajo-1"))
	mock.ExpectCommit()

	item, err := svc.CreateTrabajo(context.Background(), CreateTrabajoRequest{
		MateriaID: &materiaID,
		Titulo:    "Trabajo prueba",
	}, "admin-1", "admin")
	if err != nil {
		t.Fatalf("CreateTrabajo returned error: %v", err)
	}
	if item == nil {
		t.Fatalf("expected created trabajo")
	}
	if item.MateriaID == nil || *item.MateriaID != materiaID {
		t.Fatalf("expected materia_id=%q, got %+v", materiaID, item.MateriaID)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestCreateTrabajoResolvesMateriaFromLeccion(t *testing.T) {
	db, mock := newTrabajosServiceMockDB(t)
	repo := NewRepository(db)
	svc := NewService(repo, nil, nil)

	leccionID := "lec-1"
	resolvedMateria := "mat-resuelta"

	mock.ExpectQuery(regexp.MustCompile(`SELECT m\.id.*FROM internal\.leccion l.*WHERE l\.id = \$1.*LIMIT \$2`).String()).
		WithArgs(leccionID, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(resolvedMateria))

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.MustCompile(`INSERT INTO "internal"\."trabajo"`).String()).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("trabajo-2"))
	mock.ExpectCommit()

	item, err := svc.CreateTrabajo(context.Background(), CreateTrabajoRequest{
		LeccionID: &leccionID,
		Titulo:    "Trabajo con leccion",
	}, "admin-1", "admin")
	if err != nil {
		t.Fatalf("CreateTrabajo returned error: %v", err)
	}
	if item == nil || item.MateriaID == nil || *item.MateriaID != resolvedMateria {
		t.Fatalf("expected resolved materia_id=%q, got %+v", resolvedMateria, item)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestCreateTrabajoWithoutMateriaOrValidLeccionFails(t *testing.T) {
	db, mock := newTrabajosServiceMockDB(t)
	repo := NewRepository(db)
	svc := NewService(repo, nil, nil)

	leccionID := "lec-invalida"
	mock.ExpectQuery(regexp.MustCompile(`SELECT m\.id.*FROM internal\.leccion l.*WHERE l\.id = \$1.*LIMIT \$2`).String()).
		WithArgs(leccionID, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	_, err := svc.CreateTrabajo(context.Background(), CreateTrabajoRequest{
		LeccionID: &leccionID,
		Titulo:    "Trabajo invalido",
	}, "admin-1", "admin")
	if err == nil {
		t.Fatalf("expected error when materia cannot be resolved from leccion")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "materia_id requerido o leccion_id invalido") {
		t.Fatalf("unexpected error message: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestCreateTrabajoTeacherUnauthorizedMateria(t *testing.T) {
	db, mock := newTrabajosServiceMockDB(t)
	repo := NewRepository(db)
	svc := NewService(repo, nil, nil)

	materiaID := "mat-2"
	teacherID := "teacher-1"

	mock.ExpectQuery(regexp.MustCompile(`SELECT count\(\*\).*FROM internal\.materia m.*JOIN internal\.curso c ON c\.id = m\.curso_id.*WHERE m\.id = \$1 AND c\.teacher_id = \$2`).String()).
		WithArgs(materiaID, teacherID).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	_, err := svc.CreateTrabajo(context.Background(), CreateTrabajoRequest{
		MateriaID: &materiaID,
		Titulo:    "Trabajo sin permiso",
	}, teacherID, "teacher")
	if err == nil {
		t.Fatalf("expected unauthorized error")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "no autorizado para esta materia") {
		t.Fatalf("unexpected error message: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func newTrabajosServiceMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
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
