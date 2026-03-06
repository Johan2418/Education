# Backend Local — PostgreSQL + PostgREST

Backend sin dependencias de terceros. Usa PostgreSQL como base de datos y PostgREST como API REST automática, todo ejecutándose localmente vía Docker.

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (incluye Docker Compose)

## Inicio rápido

```bash
# 1. Copiar variables de entorno
cp .env.example .env

# 2. Editar .env — cambiar POSTGRES_PASSWORD y POSTGREST_JWT_SECRET
#    Generar un JWT secret seguro:
#    openssl rand -base64 32

# 3. Levantar los servicios
docker compose up -d

# 4. Verificar que todo está corriendo
docker compose ps
```

## Servicios

| Servicio     | Puerto | URL                         | Descripción                          |
|-------------|--------|-----------------------------|--------------------------------------|
| PostgreSQL  | 5432   | `localhost:5432`            | Base de datos                        |
| PostgREST   | 3000   | `http://localhost:3000`     | API REST automática                  |
| Swagger UI  | 8080   | `http://localhost:8080`     | Documentación interactiva de la API  |

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

# Conectarse a PostgreSQL directamente
docker compose exec db psql -U arcanea_admin -d arcanea

# Reiniciar desde cero (borra datos)
docker compose down -v
docker compose up -d

# Solo reconstruir sin borrar datos
docker compose restart
```

## Super admin por defecto

- **Email:** `superadmin@arcanea.local`
- **Password:** `SuperAdmin12345!`

> ⚠️ Cambia esta contraseña en producción.

## Datos semilla

Se crean automáticamente 5 cursos: 1er Año, 2do Año, 3er Año, 4to Año, 5to Año.
