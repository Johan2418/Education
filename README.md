# Backend Local — PostgreSQL + PostgREST + Ollama

Backend sin dependencias de terceros. Usa PostgreSQL como base de datos, PostgREST como API REST automática y Ollama para IA local, todo ejecutándose localmente vía Docker.

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (incluye Docker Compose)
- Drivers NVIDIA instalados (si usarás aceleración GPU en Ollama)
- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) para exponer GPU a contenedores

## Inicio rápido

```bash
# 1. Copiar variables de entorno
cp .env.example .env

# 2. Editar .env — cambiar POSTGRES_PASSWORD y POSTGREST_JWT_SECRET
#    Generar un JWT secret seguro:
#    openssl rand -base64 32

# 3. Levantar los servicios
docker compose up -d

# 4. Crear modelos locales especializados (analysis + mcp)
docker compose up ollama-bootstrap

# 5. Ver modelos disponibles
docker compose exec ollama ollama list

# 6. Verificar que todo está corriendo
docker compose ps
```

## Servicios

| Servicio     | Puerto | URL                         | Descripción                          |
|-------------|--------|-----------------------------|--------------------------------------|
| PostgreSQL  | 5432   | `localhost:5432`            | Base de datos                        |
| PostgREST   | 3000   | `http://localhost:3000`     | API REST automática                  |
| Swagger UI  | 8080   | `http://localhost:8080`     | Documentación interactiva de la API  |
| Ollama      | 11434  | `http://localhost:11434`    | LLM local para IA del backend        |

## Configuración de IA local (backend Go)

El backend Go corre fuera de Docker y se conecta a Ollama por `localhost:11434`.

Variables mínimas recomendadas en `.env`:

```env
HUGGINGFACE_MODEL=qwen2.5:latest
HUGGINGFACE_BASE_URL=http://localhost:11434
HUGGINGFACE_TIMEOUT_SECONDS=90

LIBRO_IA_MODEL=qwen2.5:latest
LIBRO_IA_BASE_URL=http://localhost:11434
LIBRO_IA_TIMEOUT_SECONDS=120

LIBRO_ANALYSIS_MODEL=arcanea-analysis:latest
LIBRO_ANALYSIS_BASE_URL=http://localhost:11434
LIBRO_ANALYSIS_TIMEOUT_SECONDS=120

LIBRO_MCP_MODEL=arcanea-mcp:latest
LIBRO_MCP_BASE_URL=http://localhost:11434
LIBRO_MCP_TIMEOUT_SECONDS=90

LIBRO_MODEL_BENCH_ENABLED=true
LIBRO_MODEL_TRAINING_REVISION=2026.05.0
LIBRO_MODEL_BENCHMARK_BATCH_ID=2026.05.0
LIBRO_EXTRACT_WORKERS=2
LIBRO_EXTRACT_QUEUE_SIZE=100
LIBRO_EXTRACT_JOB_TTL_MINUTES=60

OLLAMA_CANDIDATE_MODELS=qwen2.5:1.5b,qwen2.5:3b,qwen2.5:latest,llama3.2:3b,phi3:mini
LIBRO_ANALYSIS_BASE_MODEL=qwen2.5:latest
LIBRO_MCP_BASE_MODEL=qwen2.5:3b
```

Notas:
- `HUGGINGFACE_API_KEY` y `LIBRO_IA_API_KEY` pueden quedar vacíos en modo local con Ollama.
- Si luego quieres volver a Hugging Face remoto, ajusta `*_BASE_URL` a `https://router.huggingface.co` y configura API key.
- El servicio `ollama-bootstrap` crea los modelos `arcanea-analysis:latest` y `arcanea-mcp:latest` desde `ops/ollama/modelfiles`.

## Benchmark y mejora continua de modelos

```bash
# 1) Exportar dataset interno (snapshots + chat + feedback)
cd backend
go run ./cmd/libro_dataset_export --out-dir ../qa-reports/libro-datasets

# 2) Evaluar candidatos de OLLAMA_CANDIDATE_MODELS
go run ./cmd/libro_model_bench --out-dir ../qa-reports

# 3) Métricas operativas por model_tag (producción)
go run ./cmd/libro_eval --window-days 30
```

## Quick QA Libro (smoke + carga)

Objetivo: validar heuristica, flujo multilibro y rendimiento operativo de forma reproducible usando PDFs locales (por defecto `libro_prueba/`).

```bash
# 1) Tests backend (scheduler + confirmacion sin publicacion + metadata)
cd backend
go test ./...

# 2) Tests de heuristica frontend
cd ../frontend
npm install
npm run test:libro-heuristica

# 3) Smoke rapido (1-2 libros, corrida corta)
npm run qa:libro:smoke

# 4) Carga opcional (repite libros para simular lote)
npm run qa:libro:stress

# 5) Ejecucion custom por carpeta/repeticion/concurrencia
node scripts/benchmark-libro-batch.mjs \
  --mode=stress \
  --books-dir=../libro_prueba \
  --repeat=10 \
  --concurrency=4 \
  --max-pages=0 \
  --max-preguntas=0 \
  --timeout=420000
```

Salidas:
- Reportes JSON/CSV en `qa-reports/libro-batch-*.{json,csv}`
- Comparativo automatico `comparison_vs_previous` contra la corrida anterior compatible (misma configuracion)

Campos clave del reporte:
- `books_total`, `jobs_ok`, `jobs_failed`
- `throughput_books_min`
- `latency_ms_p50`, `latency_ms_p95`
- `error_breakdown`

Umbrales recomendados (guia inicial):
- Smoke: `jobs_failed = 0` y `latency_ms_p95` estable entre corridas
- Stress: sin errores de saturacion inesperados y `latency_ms_p95` sin crecimiento descontrolado

## Jerarquía Académica

```
Curso (año)
  └── Materia (asignatura)
       └── Unidad
            └── Tema
                 └── Lección
                      └── Secciones (recurso | prueba | modelo 3D)
```

## Esquema de base de datos

```
internal.*   → Tablas reales (no expuestas directamente)
api.*        → Vistas sobre internal (expuestas por PostgREST)
```

### Tablas principales

| Tabla                    | Propósito                                             |
|--------------------------|-------------------------------------------------------|
| profiles                 | Usuarios (email, rol, nombre)                         |
| curso                    | Año académico / grado (1er Año, 5to Año...)           |
| estudiante_curso         | Relación estudiante ↔ curso                           |
| materia                  | Asignaturas por curso (Matemáticas, Química...)       |
| unidad                   | Unidades dentro de una materia                        |
| tema                     | Temas dentro de una unidad (Suma y Resta...)          |
| leccion                  | Lecciones dentro de un tema                           |
| leccion_seccion          | Secciones de lección (recurso/prueba/modelo)          |
| recurso                  | Pool compartido de recursos reutilizables             |
| modelo_ra                | Modelos 3D/AR (pool compartido)                       |
| prueba                   | Pruebas/exámenes                                      |
| pregunta                 | Preguntas de prueba                                   |
| respuesta                | Opciones de respuesta                                 |
| progreso                 | Progreso por lección                                  |
| progreso_seccion         | Progreso por sección                                  |
| resultado_prueba         | Resultados de pruebas                                 |
| materia_seguimiento      | Seguimiento de materias por estudiante                |

## Roles del sistema

| Rol                | Descripción                                                         |
|--------------------|---------------------------------------------------------------------|
| `student`          | Estudiante. Acceso de lectura y progreso propio                     |
| `teacher`          | Profesor. Crea materias, unidades, temas, lecciones, recursos       |
| `resource_manager` | Gestor de recursos. Puede subir recursos y modelos 3D               |
| `admin`            | Administrador (creado por super_admin). Gestión general             |
| `super_admin`      | Super administrador. Puede crear admins y gestionar roles           |

**Quién puede subir recursos:** `resource_manager`, `teacher`, `admin`, `super_admin`

## Autenticación

PostgREST usa JWT. Las funciones de auth están en el esquema `api`:

```bash
# Registrar usuario
curl -X POST http://localhost:3000/rpc/register \
  -H "Content-Type: application/json" \
  -d '{"p_email": "user@test.com", "p_password": "password123", "p_display_name": "Test User"}'

# Login
curl -X POST http://localhost:3000/rpc/login \
  -H "Content-Type: application/json" \
  -d '{"p_email": "user@test.com", "p_password": "password123"}'

# Usar el token devuelto en peticiones autenticadas
curl http://localhost:3000/rpc/me \
  -H "Authorization: Bearer <token>"

# Crear admin (solo super_admin)
curl -X POST http://localhost:3000/rpc/create_admin \
  -H "Authorization: Bearer <super_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"p_email": "admin@school.com", "p_password": "Admin12345!", "p_display_name": "Nuevo Admin"}'

# Cambiar rol de usuario (solo admin/super_admin)
curl -X POST http://localhost:3000/rpc/change_user_role \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"p_user_id": "<uuid>", "p_new_role": "teacher"}'
```

## Estructura de archivos

```
nueva - implementación/
├── docker-compose.yml        # PostgreSQL + PostgREST + Swagger
├── .env.example              # Variables de entorno (template)
├── .gitignore
├── db/
│   └── migrations/           # Se ejecutan en orden al crear la BD
│       ├── 001_roles_schemas.sql
│       ├── 002_extensions.sql
│       ├── 003_tables.sql
│       ├── 004_views.sql
│       ├── 005_rls.sql
│       ├── 006_auth_functions.sql
│       ├── 007_grants.sql
│       ├── 008_jwt_config.sql
│       └── 009_seed.sql
└── README.md
```

## Comandos útiles

```bash
# Ver logs
docker compose logs -f db
docker compose logs -f postgrest
docker compose logs -f ollama

# Conectarse a PostgreSQL directamente
docker compose exec db psql -U arcanea_admin -d arcanea

# Reiniciar desde cero (borra datos)
docker compose down -v
docker compose up -d

# Solo reconstruir sin borrar datos
docker compose restart

# Ver modelos descargados en Ollama
docker compose exec ollama ollama list
```

## Super admin por defecto

- **Email:** `superadmin@arcanea.local`
- **Password:** `SuperAdmin12345!`

> ⚠️ Cambia esta contraseña en producción.

## Datos semilla

Se crean automáticamente 5 cursos: 1er Año, 2do Año, 3er Año, 4to Año, 5to Año.
