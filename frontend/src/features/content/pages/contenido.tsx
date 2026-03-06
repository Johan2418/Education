import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/shared/lib/api";
import toast from "react-hot-toast";
import type { Materia, Unidad, Tema, Leccion } from "@/shared/types";

export default function ContenidoPage() {
  const { materiaId } = useParams<{ materiaId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [materia, setMateria] = useState<Materia | null>(null);
  const [unidades, setUnidades] = useState<(Unidad & { temas: (Tema & { lecciones: Leccion[] })[] })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!materiaId) return;
    (async () => {
      setLoading(true);
      try {
        const mat: Materia = await api.get(`/materias/${materiaId}`);
        setMateria(mat);

        const unis: Unidad[] = await api.get(`/materias/${materiaId}/unidades`);
        const enriched = await Promise.all(
          (unis || []).map(async (u) => {
            const temas: Tema[] = await api.get(`/unidades/${u.id}/temas`);
            const temasConLecciones = await Promise.all(
              (temas || []).map(async (tema) => {
                const lecciones: Leccion[] = await api.get(`/temas/${tema.id}/lecciones`);
                return { ...tema, lecciones: lecciones || [] };
              })
            );
            return { ...u, temas: temasConLecciones };
          })
        );
        setUnidades(enriched);
      } catch (err) {
        console.error("Error loading materia", err);
        toast.error(t("contents.loadError", { defaultValue: "Error al cargar contenido" }));
      } finally {
        setLoading(false);
      }
    })();
  }, [materiaId, t]);

  if (loading) return <div className="text-center py-8 text-gray-500">{t("loading", { defaultValue: "Cargando..." })}</div>;
  if (!materia) return <div className="text-center py-8 text-gray-500">{t("contents.notFound", { defaultValue: "Contenido no encontrado" })}</div>;

  return (
    <div className="max-w-4xl mx-auto p-4">
      <button onClick={() => navigate("/contents")} className="text-blue-600 hover:underline mb-4 inline-block">&larr; {t("common.back", { defaultValue: "Volver" })}</button>
      <h1 className="text-2xl font-bold mb-2">{materia.nombre}</h1>
      {materia.descripcion && <p className="text-gray-600 mb-6">{materia.descripcion}</p>}

      {unidades.length === 0 ? (
        <p className="text-gray-500">{t("contents.noUnits", { defaultValue: "No hay unidades disponibles" })}</p>
      ) : (
        <div className="space-y-6">
          {unidades.map((u) => (
            <div key={u.id} className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold mb-2">{u.nombre}</h2>
              {u.descripcion && <p className="text-sm text-gray-500 mb-3">{u.descripcion}</p>}
              {u.temas.length === 0 ? (
                <p className="text-sm text-gray-400">{t("contents.noTopics", { defaultValue: "Sin temas" })}</p>
              ) : (
                u.temas.map((tema) => (
                  <div key={tema.id} className="ml-4 mb-3">
                    <h3 className="font-medium text-gray-800">{tema.nombre}</h3>
                    {tema.lecciones.length > 0 && (
                      <ul className="mt-1 space-y-1">
                        {tema.lecciones.map((l) => (
                          <li key={l.id}>
                            <button onClick={() => navigate(`/lesson/${l.id}`)} className="text-blue-600 hover:underline text-sm">
                              {l.titulo}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
