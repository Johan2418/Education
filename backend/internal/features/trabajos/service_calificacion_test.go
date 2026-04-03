package trabajos

import "testing"

func TestResolveCalificacionCambioPrimeraCalificacion(t *testing.T) {
	tipo, motivo, err := resolveCalificacionCambio("", nil, false)
	if err != nil {
		t.Fatalf("error inesperado: %v", err)
	}
	if tipo != CalificacionTipoManual {
		t.Fatalf("tipo esperado %q, obtenido %q", CalificacionTipoManual, tipo)
	}
	if motivo != nil {
		t.Fatalf("motivo debe ser nil en primera calificacion")
	}
}

func TestResolveCalificacionCambioSobrescrituraRequiereMotivo(t *testing.T) {
	_, _, err := resolveCalificacionCambio("", nil, true)
	if err == nil {
		t.Fatalf("se esperaba error por motivo faltante en sobreescritura")
	}
}

func TestResolveCalificacionCambioSobrescrituraNormalizaTipoYMotivo(t *testing.T) {
	motivoInput := "  Ajuste por rubrica  "
	tipo, motivo, err := resolveCalificacionCambio(CalificacionTipoManual, &motivoInput, true)
	if err != nil {
		t.Fatalf("error inesperado: %v", err)
	}
	if tipo != CalificacionTipoManualOverride {
		t.Fatalf("tipo esperado %q en sobreescritura, obtenido %q", CalificacionTipoManualOverride, tipo)
	}
	if motivo == nil || *motivo != "Ajuste por rubrica" {
		t.Fatalf("motivo esperado normalizado, obtenido %#v", motivo)
	}
}

func TestResolveCalificacionCambioManualOverrideSinSobrescrituraFalla(t *testing.T) {
	motivoInput := "Cambio"
	_, _, err := resolveCalificacionCambio(CalificacionTipoManualOverride, &motivoInput, false)
	if err == nil {
		t.Fatalf("se esperaba error cuando manual_override no es sobreescritura")
	}
}

func TestResolveCalificacionCambioTipoInvalido(t *testing.T) {
	motivoInput := "Justificacion"
	_, _, err := resolveCalificacionCambio("desconocido", &motivoInput, true)
	if err == nil {
		t.Fatalf("se esperaba error con tipo_cambio invalido")
	}
}
