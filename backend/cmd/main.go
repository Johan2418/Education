package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/arcanea/backend/internal/config"
	"github.com/arcanea/backend/internal/database"
	"github.com/arcanea/backend/internal/email"
	jwtpkg "github.com/arcanea/backend/internal/jwt"
	"github.com/arcanea/backend/internal/middleware"

	"github.com/arcanea/backend/internal/features/academic"
	"github.com/arcanea/backend/internal/features/auth"
	"github.com/arcanea/backend/internal/features/bulkimport"
	"github.com/arcanea/backend/internal/features/evaluations"
	"github.com/arcanea/backend/internal/features/libro"
	"github.com/arcanea/backend/internal/features/resources"
	"github.com/arcanea/backend/internal/features/trabajos"
	"github.com/arcanea/backend/internal/notifications"
)

func main() {
	// ── Config ──────────────────────────────────────────────
	cfg := config.Load()

	// ── Database ────────────────────────────────────────────
	db, err := database.Connect(cfg.Database)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("db underlying: %v", err)
	}
	defer sqlDB.Close()

	// ── JWT service ─────────────────────────────────────────
	jwtSvc := jwtpkg.NewService(cfg.JWT.Secret, cfg.JWT.ExpireHours)

	// ── Dependency injection ────────────────────────────────
	emailSvc := email.NewService(cfg.Email)
	notifSvc := notifications.NewService(emailSvc)

	authRepo := auth.NewRepository(db)
	authSvc := auth.NewService(authRepo, jwtSvc, emailSvc)
	authH := auth.NewHandler(authSvc)

	acadRepo := academic.NewRepository(db)
	acadSvc := academic.NewService(acadRepo)
	acadH := academic.NewHandler(acadSvc)

	resRepo := resources.NewRepository(db)
	resSvc := resources.NewService(resRepo)
	resH := resources.NewHandler(resSvc)

	evalRepo := evaluations.NewRepository(db)
	evalSvc := evaluations.NewService(evalRepo)
	evalH := evaluations.NewHandler(evalSvc)

	trabRepo := trabajos.NewRepository(db)
	trabSvc := trabajos.NewService(trabRepo, notifSvc)
	trabH := trabajos.NewHandler(trabSvc)

	libroRepo := libro.NewRepository(db)
	libroAISvc := libro.NewAIService(cfg.LibroIA)
	libroSvc := libro.NewService(libroRepo, libroAISvc)
	libroH := libro.NewHandler(libroSvc)

	aiSvc := bulkimport.NewAIService(cfg.HuggingFace)
	bulkSvc := bulkimport.NewService(authRepo, acadRepo, aiSvc)
	bulkH := bulkimport.NewHandler(bulkSvc)

	// ── Router ──────────────────────────────────────────────
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RealIP)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Root & health
	r.Get("/", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"name":"Arcanea API","version":"1.0.0","status":"running"}`))
	})
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// ── Public auth routes ──────────────────────────────────
	// r.Post("/auth/register", authH.Register) // Registration disabled — only admins create users
	r.Post("/auth/login", authH.Login)
	r.Get("/auth/verify", authH.VerifyEmail)
	r.Post("/auth/resend-verification", authH.ResendVerification)

	// ── Protected routes ────────────────────────────────────
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(jwtSvc))

		// Auth / Profile
		r.Get("/auth/me", authH.Me)
		r.Put("/auth/profile", authH.UpdateProfile)
		r.Get("/students", authH.ListStudents)

		// ── Academic: Cursos ────────────────────────────────
		r.Get("/cursos", acadH.ListCursos)
		r.Get("/cursos/{cursoId}", acadH.GetCurso)
		r.Post("/cursos", acadH.CreateCurso)
		r.Put("/cursos/{cursoId}", acadH.UpdateCurso)
		r.Delete("/cursos/{cursoId}", acadH.DeleteCurso)

		// Enrollment
		r.Get("/cursos/{cursoId}/estudiantes", acadH.ListEstudianteCursos)
		r.Post("/cursos/{cursoId}/estudiantes", acadH.EnrollStudent)
		r.Delete("/cursos/{cursoId}/estudiantes/{estudianteId}", acadH.UnenrollStudent)

		// ── Academic: Materias ──────────────────────────────
		r.Get("/cursos/{cursoId}/materias", acadH.ListMaterias)
		r.Get("/materias/{materiaId}", acadH.GetMateria)
		r.Post("/materias", acadH.CreateMateria)
		r.Put("/materias/{materiaId}", acadH.UpdateMateria)
		r.Delete("/materias/{materiaId}", acadH.DeleteMateria)

		// Seguimiento de materias
		r.Get("/materias/{materiaId}/seguimientos", acadH.ListSeguimientos)
		r.Post("/materias/{materiaId}/seguir", acadH.SeguirMateria)
		r.Delete("/materias/{materiaId}/seguir", acadH.DejarDeSeguirMateria)

		// ── Academic: Unidades ──────────────────────────────
		r.Get("/materias/{materiaId}/unidades", acadH.ListUnidades)
		r.Get("/unidades/{unidadId}", acadH.GetUnidad)
		r.Post("/unidades", acadH.CreateUnidad)
		r.Put("/unidades/{unidadId}", acadH.UpdateUnidad)
		r.Delete("/unidades/{unidadId}", acadH.DeleteUnidad)

		// ── Academic: Temas ─────────────────────────────────
		r.Get("/unidades/{unidadId}/temas", acadH.ListTemas)
		r.Get("/temas/{temaId}", acadH.GetTema)
		r.Post("/temas", acadH.CreateTema)
		r.Put("/temas/{temaId}", acadH.UpdateTema)
		r.Delete("/temas/{temaId}", acadH.DeleteTema)

		// ── Academic: Lecciones ─────────────────────────────
		r.Get("/temas/{temaId}/lecciones", acadH.ListLecciones)
		r.Get("/lecciones/{leccionId}", acadH.GetLeccion)
		r.Post("/lecciones", acadH.CreateLeccion)
		r.Put("/lecciones/{leccionId}", acadH.UpdateLeccion)
		r.Delete("/lecciones/{leccionId}", acadH.DeleteLeccion)

		// Secciones de lección
		r.Get("/lecciones/{leccionId}/secciones", acadH.ListSecciones)
		r.Post("/secciones", acadH.CreateSeccion)
		r.Put("/secciones/{seccionId}", acadH.UpdateSeccion)
		r.Delete("/secciones/{seccionId}", acadH.DeleteSeccion)

		// ── Resources ───────────────────────────────────────
		r.Get("/recursos", resH.ListRecursos)
		r.Get("/recursos/{recursoId}", resH.GetRecurso)
		r.Post("/recursos", resH.CreateRecurso)
		r.Put("/recursos/{recursoId}", resH.UpdateRecurso)
		r.Delete("/recursos/{recursoId}", resH.DeleteRecurso)

		r.Get("/modelos", resH.ListModelos)
		r.Get("/modelos/{modeloId}", resH.GetModelo)
		r.Post("/modelos", resH.CreateModelo)
		r.Put("/modelos/{modeloId}", resH.UpdateModelo)
		r.Delete("/modelos/{modeloId}", resH.DeleteModelo)

		// ── Evaluations: Pruebas ────────────────────────────
		r.Get("/lecciones/{leccionId}/pruebas", evalH.ListPruebas)
		r.Get("/pruebas/{pruebaId}", evalH.GetPrueba)
		r.Get("/pruebas/{pruebaId}/completa", evalH.GetPruebaCompleta)
		r.Post("/pruebas", evalH.CreatePrueba)
		r.Put("/pruebas/{pruebaId}", evalH.UpdatePrueba)
		r.Delete("/pruebas/{pruebaId}", evalH.DeletePrueba)

		// Preguntas
		r.Get("/pruebas/{pruebaId}/preguntas", evalH.ListPreguntas)
		r.Post("/preguntas", evalH.CreatePregunta)
		r.Put("/preguntas/{preguntaId}", evalH.UpdatePregunta)
		r.Delete("/preguntas/{preguntaId}", evalH.DeletePregunta)

		// Respuestas
		r.Post("/respuestas", evalH.CreateRespuesta)
		r.Put("/respuestas/{respuestaId}", evalH.UpdateRespuesta)
		r.Delete("/respuestas/{respuestaId}", evalH.DeleteRespuesta)

		// Resultados
		r.Post("/resultados", evalH.SubmitResultado)
		r.Get("/pruebas/{pruebaId}/resultados", evalH.ListResultadosByPrueba)
		r.Get("/pruebas/{pruebaId}/mis-resultados", evalH.ListMisResultados)
		r.Get("/pruebas/{pruebaId}/mejor-resultado", evalH.GetBestResultado)

		// Progreso (nivel lección)
		r.Put("/progreso", evalH.UpsertProgreso)
		r.Get("/progreso", evalH.ListMisProgresos)
		r.Get("/lecciones/{leccionId}/progreso", evalH.GetProgreso)

		// Progreso secciones
		r.Put("/progreso-secciones", evalH.UpsertProgresoSeccion)
		r.Get("/lecciones/{leccionId}/progreso-secciones", evalH.ListProgresoSecciones)

		// ── Trabajos ───────────────────────────────────────
		r.Get("/lecciones/{leccionId}/trabajos", trabH.ListTrabajosByLeccion)
		r.Post("/trabajos", trabH.CreateTrabajo)
		r.Put("/trabajos/{trabajoId}", trabH.UpdateTrabajo)
		r.Put("/trabajos/{trabajoId}/publicar", trabH.PublicarTrabajo)
		r.Put("/trabajos/{trabajoId}/cerrar", trabH.CerrarTrabajo)
		r.Delete("/trabajos/{trabajoId}", trabH.DeleteTrabajo)
		r.Get("/trabajos/{trabajoId}", trabH.GetTrabajo)
		r.Get("/mis-trabajos", trabH.ListMisTrabajos)
		r.Post("/trabajos/{trabajoId}/entregas", trabH.UpsertEntrega)
		r.Get("/trabajos/{trabajoId}/mi-entrega", trabH.GetMiEntrega)
		r.Get("/trabajos/{trabajoId}/formulario", trabH.GetTrabajoFormulario)
		r.Put("/entregas/{entregaId}", trabH.UpdateEntregaByID)
		r.Get("/trabajos/{trabajoId}/entregas", trabH.ListEntregasByTrabajo)
		r.Get("/trabajos/analytics/v2", trabH.GetTrabajoAnalyticsV2)
		r.Get("/trabajos/{trabajoId}/reportes", trabH.GetTrabajoReporte)
		r.Get("/trabajos/{trabajoId}/notificaciones", trabH.GetTrabajoNotificaciones)
		r.Get("/trabajos/{trabajoId}/entregas/export", trabH.ExportEntregasCSV)
		r.Get("/trabajos/{trabajoId}/entregas/export.xlsx", trabH.ExportEntregasXLSX)
		r.Get("/entregas/{entregaId}/detalle", trabH.GetEntregaDetalle)
		r.Put("/entregas/{entregaId}/calificar", trabH.CalificarEntrega)
		r.Put("/entregas/{entregaId}/calificar-por-pregunta", trabH.CalificarEntregaPorPregunta)
		r.Get("/trabajos/{trabajoId}/libro", libroH.GetEstado)
		r.Get("/trabajos/{trabajoId}/libro/observabilidad", libroH.GetObservability)
		r.Post("/trabajos/{trabajoId}/libro/extract", libroH.ExtractLibro)
		r.Post("/trabajos/{trabajoId}/libro/extract-async", libroH.StartExtractLibroAsync)
		r.Get("/trabajos/{trabajoId}/libro/jobs/{jobId}", libroH.GetExtractLibroJobStatus)
		r.Put("/trabajos/{trabajoId}/libro/revision", libroH.RevisarLibro)
		r.Put("/trabajos/{trabajoId}/libro/confirmar", libroH.ConfirmarLibro)

		// ── Admin routes ────────────────────────────────────
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireRole("admin", "super_admin"))

			r.Get("/admin/users", authH.ListUsers)
			r.Get("/admin/users/{id}", authH.GetUser)
			r.Put("/admin/users/{id}/role", authH.ChangeRole)
			r.Post("/admin/users/{id}/approve-role", authH.ApproveRole)
			r.Post("/admin/users/{id}/reject-role", authH.RejectRole)
			r.Delete("/admin/users/{id}", authH.DeleteUser)
			r.Post("/admin/create-admin", authH.CreateAdmin)
			r.Post("/admin/bulk-import/map-columns", bulkH.MapColumns)
			r.Post("/admin/bulk-import", bulkH.AdminBulkImport)
		})

		// Teacher bulk import (teachers + admins)
		r.Post("/teacher/bulk-import/map-columns", bulkH.MapColumns)
		r.Post("/teacher/bulk-import/{cursoId}", bulkH.TeacherBulkImport)
	})

	// ── Server ──────────────────────────────────────────────
	srv := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("🚀 Server running on http://localhost:%s", cfg.Server.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	<-done
	log.Println("Shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("shutdown: %v", err)
	}
	log.Println("Server stopped")
}
