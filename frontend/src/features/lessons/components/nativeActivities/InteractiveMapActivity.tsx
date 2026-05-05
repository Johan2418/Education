import type { Dispatch, SetStateAction } from "react";
import type { NativeInteractiveConfig } from "@/features/lessons/services/interactivas";

interface Props {
  config: NativeInteractiveConfig;
  answers: Record<string, string>;
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
  submitting: boolean;
  onSubmit: () => void;
  isEditor: boolean;
}

export default function InteractiveMapActivity({
  config,
  answers,
  setAnswers,
  submitting,
  onSubmit,
  isEditor,
}: Props) {
  const selectedMarker = answers["map_selection"];
  const markers = config.mapMarkers ?? [];
  const mapUrl = config.mapImageUrl ?? "";

  const handleMarkerSelect = (markerId: string) => {
    setAnswers((prev) => ({ ...prev, map_selection: markerId }));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-emerald-300 bg-white p-3">
        <p className="text-sm font-semibold text-emerald-900">Mapa interactivo</p>
        <p className="mt-1 text-sm text-slate-600">Selecciona el punto correcto en el mapa.</p>
      </div>

      {mapUrl ? (
        <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          <img src={mapUrl} alt="Mapa interactivo" className="w-full object-cover" />
          {markers.map((marker) => {
            const left = marker.x != null ? `${Math.min(100, Math.max(0, marker.x))}%` : "50%";
            const top = marker.y != null ? `${Math.min(100, Math.max(0, marker.y))}%` : "50%";
            const isSelected = selectedMarker === marker.id;
            return (
              <button
                key={marker.id}
                type="button"
                onClick={() => handleMarkerSelect(marker.id)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-1 text-xs font-semibold text-white ${isSelected ? "bg-emerald-700 border-emerald-900" : "bg-slate-900 border-white/90"}`}
                style={{ left, top }}
              >
                {marker.label || "•"}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Falta la imagen del mapa configurada para esta actividad.
        </div>
      )}

      {markers.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-900 mb-2">Puntos disponibles</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {markers.map((marker) => (
              <button
                key={marker.id}
                type="button"
                onClick={() => handleMarkerSelect(marker.id)}
                className={`rounded-md border px-3 py-2 text-left text-sm ${selectedMarker === marker.id ? "border-emerald-700 bg-emerald-50" : "border-slate-300 bg-white hover:bg-slate-50"}`}
              >
                <p className="font-medium text-slate-900">{marker.label || `Punto ${marker.id}`}</p>
                {marker.description && <p className="text-xs text-slate-600">{marker.description}</p>}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isEditor && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || markers.length === 0}
          className="rounded-md bg-emerald-700 px-3 py-2 text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {submitting ? "Enviando..." : "Enviar actividad nativa"}
        </button>
      )}
    </div>
  );
}
