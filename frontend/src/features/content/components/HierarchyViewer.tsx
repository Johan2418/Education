import { useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { Unidad, Tema, Leccion } from "@/shared/types";

interface HierarchyViewerProps {
  unidades: (Unidad & { temas: (Tema & { lecciones: Leccion[] })[] })[];
  onSelectUnidad?: (unidadId: string) => void;
  onSelectTema?: (temaId: string) => void;
  canDelete?: boolean;
  isDeletingUnidad?: string | null;
  isDeletingTema?: string | null;
  isDeletingLeccion?: string | null;
  onDeleteUnidad?: (unidadId: string, nombre: string) => void;
  onDeleteTema?: (temaId: string, nombre: string) => void;
  onDeleteLeccion?: (leccionId: string, titulo: string) => void;
}

export function HierarchyViewer({ 
  unidades, 
  onSelectUnidad, 
  onSelectTema,
  canDelete,
  isDeletingUnidad,
  isDeletingTema,
  isDeletingLeccion,
  onDeleteUnidad,
  onDeleteTema,
  onDeleteLeccion,
}: HierarchyViewerProps) {
  const [expandedUnidades, setExpandedUnidades] = useState<Set<string>>(new Set());
  const [expandedTemas, setExpandedTemas] = useState<Set<string>>(new Set());

  const toggleUnidad = (unidadId: string) => {
    const newSet = new Set(expandedUnidades);
    if (newSet.has(unidadId)) {
      newSet.delete(unidadId);
    } else {
      newSet.add(unidadId);
    }
    setExpandedUnidades(newSet);
  };

  const toggleTema = (temaId: string) => {
    const newSet = new Set(expandedTemas);
    if (newSet.has(temaId)) {
      newSet.delete(temaId);
    } else {
      newSet.add(temaId);
    }
    setExpandedTemas(newSet);
  };

  const handleUnidadClick = (unidadId: string) => {
    onSelectUnidad?.(unidadId);
    toggleUnidad(unidadId);
  };

  const handleTemaClick = (temaId: string) => {
    onSelectTema?.(temaId);
    toggleTema(temaId);
  };

  if (unidades.length === 0) {
    return (
      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
        No hay contenido creado aún. Crea tu primera unidad abajo.
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-violet-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-violet-900">Contenido Existente</h3>
      <div className="space-y-1">
        {unidades.map((unidad) => (
          <div key={unidad.id}>
            {/* Unidad row */}
            <button
              onClick={() => handleUnidadClick(unidad.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-violet-100 transition"
            >
              {expandedUnidades.has(unidad.id) ? (
                <ChevronDown size={16} className="text-violet-600 flex-shrink-0" />
              ) : (
                <ChevronRight size={16} className="text-violet-600 flex-shrink-0" />
              )}
              <span className="font-medium text-violet-900">{unidad.nombre}</span>
              <span className="ml-auto text-xs text-violet-600 bg-violet-100 px-2 py-0.5 rounded">
                {unidad.temas.length} tema{unidad.temas.length !== 1 ? "s" : ""}
              </span>
              {canDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteUnidad?.(unidad.id, unidad.nombre);
                  }}
                  disabled={isDeletingUnidad === unidad.id}
                  className="ml-2 rounded px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50 transition text-xs"
                  title="Eliminar unidad"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </button>

            {/* Temas (expanded) */}
            {expandedUnidades.has(unidad.id) && (
              <div className="ml-6 space-y-1">
                {unidad.temas.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-gray-400 italic">Sin temas</div>
                ) : (
                  unidad.temas.map((tema) => (
                    <div key={tema.id}>
                      {/* Tema row */}
                      <button
                        onClick={() => handleTemaClick(tema.id)}
                        className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-violet-100 transition"
                      >
                        {expandedTemas.has(tema.id) ? (
                          <ChevronDown size={14} className="text-violet-500 flex-shrink-0" />
                        ) : (
                          <ChevronRight size={14} className="text-violet-500 flex-shrink-0" />
                        )}
                        <span className="text-violet-800">{tema.nombre}</span>
                        <span className="ml-auto text-xs text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded">
                          {tema.lecciones.length} lección{tema.lecciones.length !== 1 ? "es" : ""}
                        </span>
                        {canDelete && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTema?.(tema.id, tema.nombre);
                            }}
                            disabled={isDeletingTema === tema.id}
                            className="ml-2 rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-50 transition text-xs"
                            title="Eliminar tema"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </button>

                      {/* Lecciones (expanded) */}
                      {expandedTemas.has(tema.id) && (
                        <div className="ml-5 space-y-1">
                          {tema.lecciones.length === 0 ? (
                            <div className="px-2 py-1 text-xs text-gray-400 italic">Sin lecciones</div>
                          ) : (
                            tema.lecciones.map((leccion) => (
                              <div
                                key={leccion.id}
                                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-gray-700 bg-gray-50 hover:bg-gray-100 transition group"
                              >
                                <span className="text-gray-600">📝</span>
                                <span className="flex-1">{leccion.titulo}</span>
                                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                  ✓ Creada
                                </span>
                                {canDelete && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteLeccion?.(leccion.id, leccion.titulo);
                                    }}
                                    disabled={isDeletingLeccion === leccion.id}
                                    className="ml-1 rounded px-1 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-50 transition text-xs opacity-0 group-hover:opacity-100"
                                    title="Eliminar lección"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
