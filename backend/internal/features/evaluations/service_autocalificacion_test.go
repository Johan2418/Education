package evaluations

import (
	"encoding/json"
	"testing"
)

func TestCalcularPuntajeObjetivoPonderado(t *testing.T) {
	preguntas := []PreguntaConRespuestas{
		{
			Pregunta:   Pregunta{ID: "q1", Tipo: "opcion_multiple", PuntajeMaximo: 2},
			Respuestas: []Respuesta{{ID: "r1", Texto: "A", EsCorrecta: true}},
		},
		{
			Pregunta:   Pregunta{ID: "q2", Tipo: "opcion_multiple", PuntajeMaximo: 1},
			Respuestas: []Respuesta{{ID: "r2", Texto: "B", EsCorrecta: true}},
		},
	}

	payload := json.RawMessage(`{"q1":"r1","q2":"incorrecta"}`)
	score, calculado, err := calcularPuntajeObjetivo(preguntas, payload)
	if err != nil {
		t.Fatalf("error inesperado: %v", err)
	}
	if !calculado {
		t.Fatalf("se esperaba auto-calculo para preguntas objetivas")
	}
	if score != 66.67 {
		t.Fatalf("puntaje esperado 66.67, obtenido %.2f", score)
	}
}

func TestCalcularPuntajeObjetivoAceptaTextoCorrecto(t *testing.T) {
	preguntas := []PreguntaConRespuestas{
		{
			Pregunta:   Pregunta{ID: "q1", Tipo: "verdadero_falso", PuntajeMaximo: 1},
			Respuestas: []Respuesta{{ID: "r1", Texto: "Verdadero", EsCorrecta: true}},
		},
	}

	score, calculado, err := calcularPuntajeObjetivo(preguntas, json.RawMessage(`{"q1":"verdadero"}`))
	if err != nil {
		t.Fatalf("error inesperado: %v", err)
	}
	if !calculado {
		t.Fatalf("se esperaba auto-calculo para pregunta objetiva")
	}
	if score != 100 {
		t.Fatalf("puntaje esperado 100, obtenido %.2f", score)
	}
}

func TestCalcularPuntajeObjetivoSinPreguntasObjetivas(t *testing.T) {
	preguntas := []PreguntaConRespuestas{
		{
			Pregunta:   Pregunta{ID: "q1", Tipo: "respuesta_corta", PuntajeMaximo: 2},
			Respuestas: []Respuesta{{ID: "r1", Texto: "respuesta modelo", EsCorrecta: true}},
		},
	}

	score, calculado, err := calcularPuntajeObjetivo(preguntas, json.RawMessage(`{"q1":"texto"}`))
	if err != nil {
		t.Fatalf("error inesperado: %v", err)
	}
	if calculado {
		t.Fatalf("no se esperaba auto-calculo cuando no hay preguntas objetivas")
	}
	if score != 0 {
		t.Fatalf("puntaje esperado 0 cuando no hay auto-calculo, obtenido %.2f", score)
	}
}

func TestCalcularPuntajeObjetivoJSONInvalido(t *testing.T) {
	preguntas := []PreguntaConRespuestas{
		{
			Pregunta:   Pregunta{ID: "q1", Tipo: "opcion_multiple", PuntajeMaximo: 1},
			Respuestas: []Respuesta{{ID: "r1", Texto: "A", EsCorrecta: true}},
		},
	}

	_, _, err := calcularPuntajeObjetivo(preguntas, json.RawMessage(`{"q1":`))
	if err == nil {
		t.Fatalf("se esperaba error con JSON inválido")
	}
}
