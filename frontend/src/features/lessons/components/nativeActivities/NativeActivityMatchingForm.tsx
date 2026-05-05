import { useState } from "react";
import { Trash2, Plus, GripVertical } from "lucide-react";

interface MatchingPair {
  id: string;
  leftText: string;
  rightText: string;
}

interface Props {
  pairs: MatchingPair[];
  onPairsChange: (pairs: MatchingPair[]) => void;
  description?: string;
}

export default function NativeActivityMatchingForm({
  pairs,
  onPairsChange,
  description,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [leftInput, setLeftInput] = useState("");
  const [rightInput, setRightInput] = useState("");

  const handleAddPair = () => {
    if (leftInput.trim() && rightInput.trim()) {
      const newPair: MatchingPair = {
        id: `pair_${Date.now()}_${Math.random()}`,
        leftText: leftInput.trim(),
        rightText: rightInput.trim(),
      };
      onPairsChange([...pairs, newPair]);
      setLeftInput("");
      setRightInput("");
    }
  };

  const handleUpdatePair = (id: string) => {
    if (leftInput.trim() && rightInput.trim()) {
      const updated = pairs.map((p) =>
        p.id === id
          ? { ...p, leftText: leftInput.trim(), rightText: rightInput.trim() }
          : p
      );
      onPairsChange(updated);
      setEditingId(null);
      setLeftInput("");
      setRightInput("");
    }
  };

  const handleEdit = (pair: MatchingPair) => {
    setEditingId(pair.id);
    setLeftInput(pair.leftText);
    setRightInput(pair.rightText);
  };

  const handleDelete = (id: string) => {
    onPairsChange(pairs.filter((p) => p.id !== id));
  };

  const handleCancel = () => {
    setEditingId(null);
    setLeftInput("");
    setRightInput("");
  };

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h3 className="font-semibold text-slate-900">Crear pares para emparejar</h3>
        {description && (
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        )}
      </div>

      {/* Input section */}
      <div className="space-y-3 rounded-md bg-slate-50 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-700">
              Item izquierdo (concepto/pregunta)
            </label>
            <input
              type="text"
              value={leftInput}
              onChange={(e) => setLeftInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter" && editingId === null) {
                  handleAddPair();
                }
              }}
              placeholder="Ej: Capital de Francia"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700">
              Item derecho (respuesta/traducción)
            </label>
            <input
              type="text"
              value={rightInput}
              onChange={(e) => setRightInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter" && editingId === null) {
                  handleAddPair();
                }
              }}
              placeholder="Ej: París"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          {editingId && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-200 border border-slate-300"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              editingId ? handleUpdatePair(editingId) : handleAddPair()
            }
            disabled={!leftInput.trim() || !rightInput.trim()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} />
            {editingId ? "Actualizar" : "Agregar par"}
          </button>
        </div>
      </div>

      {/* Pairs list */}
      <div className="space-y-2">
        {pairs.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 py-6 text-center">
            <p className="text-sm text-slate-500">
              No hay pares aún. Agrega el primer par arriba.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600">
              {pairs.length} par{pairs.length !== 1 ? "es" : ""}
            </p>
            <div className="space-y-1">
              {pairs.map((pair) => (
                <div
                  key={pair.id}
                  className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 hover:bg-slate-50 group"
                >
                  <GripVertical
                    size={16}
                    className="text-slate-400 opacity-0 group-hover:opacity-100"
                  />
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="truncate">
                      <div className="text-xs text-slate-500">Izquierda</div>
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {pair.leftText}
                      </div>
                    </div>
                    <div className="truncate">
                      <div className="text-xs text-slate-500">Derecha</div>
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {pair.rightText}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(pair)}
                      className="px-2 py-1 text-xs rounded hover:bg-blue-100 text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(pair.id)}
                      className="p-1 text-red-600 hover:bg-red-100 rounded"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
        <p className="text-xs text-blue-900">
          💡 <strong>Consejo:</strong> Crea al menos 4-5 pares para una buena actividad de emparejar. Los estudiantes podrán arrastrar los items del lado derecho hacia el lado izquierdo.
        </p>
      </div>
    </div>
  );
}
