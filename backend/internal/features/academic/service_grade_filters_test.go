package academic

import (
	"strings"
	"testing"
)

func strPtr(value string) *string {
	return &value
}

func TestNormalizeTeacherGradeDetailFilters_AcceptsAcademicYear(t *testing.T) {
	input := TeacherGradeDetailFilters{
		AnioEscolar: strPtr("2026-2027"),
	}

	normalized, err := normalizeTeacherGradeDetailFilters(input)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if normalized.AnioEscolar == nil {
		t.Fatal("expected anio_escolar to be set")
	}
	if *normalized.AnioEscolar != "2026-2027" {
		t.Fatalf("expected anio_escolar 2026-2027, got %s", *normalized.AnioEscolar)
	}
	if normalized.Estado == nil || *normalized.Estado != "calificada" {
		t.Fatalf("expected default estado calificada, got %+v", normalized.Estado)
	}
}

func TestNormalizeTeacherGradeDetailFilters_RejectsInvalidAcademicYear(t *testing.T) {
	input := TeacherGradeDetailFilters{
		AnioEscolar: strPtr("2026/2027"),
	}

	_, err := normalizeTeacherGradeDetailFilters(input)
	if err == nil {
		t.Fatal("expected validation error for invalid anio_escolar")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "anio_escolar") {
		t.Fatalf("expected anio_escolar validation message, got %v", err)
	}
}

func TestNormalizeTeacherGradeDetailFilters_AllowsNilAcademicYear(t *testing.T) {
	normalized, err := normalizeTeacherGradeDetailFilters(TeacherGradeDetailFilters{})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if normalized.AnioEscolar != nil {
		t.Fatalf("expected nil anio_escolar, got %+v", normalized.AnioEscolar)
	}
}
