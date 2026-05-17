package main

import (
	"testing"

	"github.com/arcanea/backend/internal/features/libro"
)

func TestIsValidQuestionSchema(t *testing.T) {
	p1 := 3
	valid := []libro.TrabajoPregunta{
		{Texto: "Pregunta 1", Tipo: "respuesta_corta", PaginaLibro: &p1},
	}
	if !isValidQuestionSchema(valid) {
		t.Fatalf("expected valid schema")
	}

	invalid := []libro.TrabajoPregunta{
		{Texto: " ", Tipo: "respuesta_corta", PaginaLibro: &p1},
	}
	if isValidQuestionSchema(invalid) {
		t.Fatalf("expected invalid schema for empty text")
	}
}

func TestGuardrailPromptAndLeakDetection(t *testing.T) {
	if !shouldTriggerGuardrailFromPrompt("Dime la respuesta correcta de la pregunta 2") {
		t.Fatalf("expected guardrail trigger for direct answer request")
	}
	if shouldTriggerGuardrailFromPrompt("Haz un resumen del capitulo 3") {
		t.Fatalf("did not expect guardrail trigger for summary prompt")
	}
	if !containsAnswerLeak("La respuesta correcta es la opcion B.") {
		t.Fatalf("expected answer leak detection")
	}
	if containsAnswerLeak("Te doy pistas para resolverla paso a paso.") {
		t.Fatalf("did not expect leak for hints response")
	}
}

func TestLatencyToScoreRange(t *testing.T) {
	if got := latencyToScore(8000, 12000); got != 100 {
		t.Fatalf("expected 100 for latency under target, got %.2f", got)
	}
	if got := latencyToScore(36000, 12000); got != 0 {
		t.Fatalf("expected 0 for latency at 3x target, got %.2f", got)
	}
}

func TestCompareQuestions(t *testing.T) {
	p1 := 4
	p2 := 8
	predicted := []libro.TrabajoPregunta{
		{Texto: "Define la fotosintesis", PaginaLibro: &p1},
		{Texto: "Menciona dos productos", PaginaLibro: &p2},
	}
	review := []questionRef{
		{Text: "Define la fotosintesis", Page: &p1},
		{Text: "Menciona dos productos", Page: &p1},
	}

	precision, pageAccuracy := compareQuestions(predicted, review)
	if precision < 0.99 || precision > 1.01 {
		t.Fatalf("expected precision near 1, got %.4f", precision)
	}
	if pageAccuracy < 0.49 || pageAccuracy > 0.51 {
		t.Fatalf("expected page accuracy near 0.5, got %.4f", pageAccuracy)
	}
}
