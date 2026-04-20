package academic

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestValidateCalificacionSeccion_PublicacionProgramadaRequiereFecha(t *testing.T) {
	estado := "programado"
	req := LeccionSeccionRequest{
		EstadoPublicacion: &estado,
	}

	err := validateCalificacionSeccion(req)
	if err == nil {
		t.Fatal("expected error when programado has nil programado_para")
	}
}

func TestValidateCalificacionSeccion_RangoVisibilidadInvalido(t *testing.T) {
	desde := time.Now().Add(2 * time.Hour)
	hasta := time.Now().Add(1 * time.Hour)
	req := LeccionSeccionRequest{
		VisibleDesde: &desde,
		VisibleHasta: &hasta,
	}

	err := validateCalificacionSeccion(req)
	if err == nil {
		t.Fatal("expected error when visible_hasta < visible_desde")
	}
}

func TestHasForoPayload(t *testing.T) {
	texto := "   idea principal   "
	imagen := "https://cdn.example.com/1.png"
	vacio := "   "

	if !hasForoPayload(&texto, nil) {
		t.Fatal("expected payload true for non-empty text")
	}
	if !hasForoPayload(nil, &imagen) {
		t.Fatal("expected payload true for image")
	}
	if hasForoPayload(&vacio, nil) {
		t.Fatal("expected payload false for whitespace-only text")
	}
}

func TestServiceCreateForoHilo_RequiresPayload(t *testing.T) {
	svc := &Service{}
	ctx := context.Background()
	titulo := "Hilo 1"
	vacio := "   "
	req := ForoHiloRequest{Titulo: titulo, Contenido: &vacio}

	_, err := svc.CreateForoHilo(ctx, "foro-1", req, "user-1")
	if err == nil {
		t.Fatal("expected error when both contenido and imagen_url are empty")
	}
}

func TestServiceUpsertVideoProgreso_ValidatesRange(t *testing.T) {
	svc := &Service{}
	ctx := context.Background()
	porcentaje := 120.0
	req := UpsertVideoProgresoRequest{
		LeccionSeccionID: "sec-1",
		YouTubeVideoID:   "yt-1",
		PorcentajeVisto:  &porcentaje,
	}

	_, err := svc.UpsertVideoProgreso(ctx, "user-1", req)
	if err == nil {
		t.Fatal("expected error when porcentaje_visto > 100")
	}
}

func TestServiceUpsertSeccionGatingPDF_RequiresPreguntasWhenEnabled(t *testing.T) {
	svc := &Service{}
	ctx := context.Background()
	habilitado := true
	req := UpsertSeccionGatingPDFRequest{
		Habilitado: &habilitado,
	}

	_, err := svc.UpsertSeccionGatingPDF(ctx, "sec-1", "teacher-1", req)
	if err == nil {
		t.Fatal("expected error when habilitado=true and seccion_preguntas_id is nil")
	}
}

func TestLeccionSeccionLifecyclePatchRequest_UnmarshalTracksPresence(t *testing.T) {
	var req LeccionSeccionLifecyclePatchRequest
	err := json.Unmarshal([]byte(`{"visible":true,"visible_hasta":null}`), &req)
	if err != nil {
		t.Fatalf("unexpected unmarshal error: %v", err)
	}

	if !req.Visible.Set || req.Visible.Value == nil || !*req.Visible.Value {
		t.Fatal("expected visible to be set=true with value=true")
	}

	if !req.VisibleHasta.Set || req.VisibleHasta.Value != nil {
		t.Fatal("expected visible_hasta to be set=true with nil value (explicit null)")
	}

	if req.AnioEscolar.Set {
		t.Fatal("expected anio_escolar to stay set=false when omitted")
	}
}

func TestValidateSeccionLifecyclePatch_ProgramadoRequiereFecha(t *testing.T) {
	current := &LeccionSeccion{EstadoPublicacion: "borrador", ProgramadoPara: nil}
	estado := "programado"
	req := LeccionSeccionLifecyclePatchRequest{
		EstadoPublicacion: Optional[string]{Set: true, Value: &estado},
	}

	err := validateSeccionLifecyclePatch(current, req)
	if err == nil {
		t.Fatal("expected error when setting estado_publicacion=programado without programado_para")
	}
}

func TestValidateSeccionLifecyclePatch_RangoVisibilidadInvalido(t *testing.T) {
	current := &LeccionSeccion{EstadoPublicacion: "publicado"}
	desde := time.Now().Add(2 * time.Hour)
	hasta := time.Now().Add(1 * time.Hour)
	req := LeccionSeccionLifecyclePatchRequest{
		VisibleDesde: Optional[time.Time]{Set: true, Value: &desde},
		VisibleHasta: Optional[time.Time]{Set: true, Value: &hasta},
	}

	err := validateSeccionLifecyclePatch(current, req)
	if err == nil {
		t.Fatal("expected error when visible_hasta < visible_desde in lifecycle patch")
	}
}

func TestValidateSeccionLifecyclePatch_VisibleNoAceptaNullCuandoSeIncluye(t *testing.T) {
	current := &LeccionSeccion{EstadoPublicacion: "publicado"}
	req := LeccionSeccionLifecyclePatchRequest{
		Visible: Optional[bool]{Set: true, Value: nil},
	}

	err := validateSeccionLifecyclePatch(current, req)
	if err == nil {
		t.Fatal("expected error when visible is included with null value")
	}
}
