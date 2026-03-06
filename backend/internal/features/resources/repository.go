package resources

import (
	"context"

	"github.com/lib/pq"
	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// ═══════════════════════════════════════════════════════════════
// RECURSO
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListRecursos(ctx context.Context) ([]Recurso, error) {
	var items []Recurso
	err := r.db.WithContext(ctx).Order("created_at DESC").Find(&items).Error
	return items, err
}

func (r *Repository) GetRecurso(ctx context.Context, id string) (*Recurso, error) {
	var rc Recurso
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&rc).Error; err != nil {
		return nil, err
	}
	return &rc, nil
}

func (r *Repository) CreateRecurso(ctx context.Context, req RecursoRequest, createdBy string) (*Recurso, error) {
	rc := Recurso{
		Titulo:      req.Titulo,
		Descripcion: req.Descripcion,
		Tipo:        req.Tipo,
		ArchivoURL:  req.ArchivoURL,
		TextoHTML:   req.TextoHTML,
		CreatedBy:   &createdBy,
	}
	if req.Tags != nil {
		rc.Tags = pq.StringArray(req.Tags)
	}
	if req.EsPublico != nil {
		rc.EsPublico = *req.EsPublico
	} else {
		rc.EsPublico = true
	}
	if err := r.db.WithContext(ctx).Create(&rc).Error; err != nil {
		return nil, err
	}
	return &rc, nil
}

func (r *Repository) UpdateRecurso(ctx context.Context, id string, req RecursoRequest) (*Recurso, error) {
	updates := map[string]interface{}{}
	if req.Titulo != "" {
		updates["titulo"] = req.Titulo
	}
	if req.Descripcion != nil {
		updates["descripcion"] = *req.Descripcion
	}
	if req.Tipo != "" {
		updates["tipo"] = gorm.Expr("?::internal.tipo_recurso", req.Tipo)
	}
	if req.ArchivoURL != nil {
		updates["archivo_url"] = *req.ArchivoURL
	}
	if req.TextoHTML != nil {
		updates["texto_html"] = *req.TextoHTML
	}
	if req.Tags != nil {
		updates["tags"] = pq.StringArray(req.Tags)
	}
	if req.EsPublico != nil {
		updates["es_publico"] = *req.EsPublico
	}
	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&Recurso{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return r.GetRecurso(ctx, id)
}

func (r *Repository) DeleteRecurso(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&Recurso{}).Error
}

// ═══════════════════════════════════════════════════════════════
// MODELO RA
// ═══════════════════════════════════════════════════════════════

func (r *Repository) ListModelos(ctx context.Context) ([]ModeloRA, error) {
	var items []ModeloRA
	err := r.db.WithContext(ctx).Order("created_at DESC").Find(&items).Error
	return items, err
}

func (r *Repository) GetModelo(ctx context.Context, id string) (*ModeloRA, error) {
	var m ModeloRA
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) CreateModelo(ctx context.Context, req ModeloRARequest, createdBy string) (*ModeloRA, error) {
	m := ModeloRA{
		NombreModelo:    req.NombreModelo,
		ArchivoURL:      req.ArchivoURL,
		Tipo:            req.Tipo,
		MoleculeFormula: req.MoleculeFormula,
		Categoria:       req.Categoria,
		CreatedBy:       &createdBy,
	}
	if req.Keywords != nil {
		m.Keywords = pq.StringArray(req.Keywords)
	}
	if req.EsPublico != nil {
		m.EsPublico = *req.EsPublico
	} else {
		m.EsPublico = true
	}
	if err := r.db.WithContext(ctx).Create(&m).Error; err != nil {
		return nil, err
	}
	return &m, nil
}

func (r *Repository) UpdateModelo(ctx context.Context, id string, req ModeloRARequest) (*ModeloRA, error) {
	updates := map[string]interface{}{}
	if req.NombreModelo != "" {
		updates["nombre_modelo"] = req.NombreModelo
	}
	if req.ArchivoURL != nil {
		updates["archivo_url"] = *req.ArchivoURL
	}
	if req.Tipo != nil {
		updates["tipo"] = *req.Tipo
	}
	if req.Keywords != nil {
		updates["keywords"] = pq.StringArray(req.Keywords)
	}
	if req.MoleculeFormula != nil {
		updates["molecule_formula"] = *req.MoleculeFormula
	}
	if req.Categoria != nil {
		updates["categoria"] = *req.Categoria
	}
	if req.EsPublico != nil {
		updates["es_publico"] = *req.EsPublico
	}
	if len(updates) > 0 {
		if err := r.db.WithContext(ctx).Model(&ModeloRA{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return r.GetModelo(ctx, id)
}

func (r *Repository) DeleteModelo(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&ModeloRA{}).Error
}
