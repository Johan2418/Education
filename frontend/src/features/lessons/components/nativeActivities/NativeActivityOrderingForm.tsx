import { useState } from "react";
import { Trash2, Plus, GripVertical, ChevronUp, ChevronDown } from "lucide-react";

interface OrderingItem {
  id: string;
  text: string;
}

interface Props {
  items: OrderingItem[];
  onItemsChange: (items: OrderingItem[]) => void;
  description?: string;
}

export default function NativeActivityOrderingForm({
  items,
  onItemsChange,
  description,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const handleAddItem = () => {
    if (input.trim()) {
      const newItem: OrderingItem = {
        id: `item_${Date.now()}_${Math.random()}`,
        text: input.trim(),
      };
      onItemsChange([...items, newItem]);
      setInput("");
    }
  };

  const handleUpdateItem = (id: string) => {
    if (input.trim()) {
      const updated = items.map((item) =>
        item.id === id ? { ...item, text: input.trim() } : item
      );
      onItemsChange(updated);
      setEditingId(null);
      setInput("");
    }
  };

  const handleEdit = (item: OrderingItem) => {
    setEditingId(item.id);
    setInput(item.text);
  };

  const handleDelete = (id: string) => {
    onItemsChange(items.filter((item) => item.id !== id));
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      const updated = [...items];
      const temp = updated[index - 1] as OrderingItem;
      updated[index - 1] = updated[index] as OrderingItem;
      updated[index] = temp;
      onItemsChange(updated);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < items.length - 1) {
      const updated = [...items];
      const temp = updated[index] as OrderingItem;
      updated[index] = updated[index + 1] as OrderingItem;
      updated[index + 1] = temp;
      onItemsChange(updated);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setInput("");
  };

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h3 className="font-semibold text-slate-900">Crear elementos para ordenar</h3>
        {description && (
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        )}
      </div>

      {/* Input section */}
      <div className="space-y-3 rounded-md bg-slate-50 p-3">
        <div>
          <label className="text-xs font-medium text-slate-700">
            Elemento a ordenar
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter" && editingId === null) {
                handleAddItem();
              }
            }}
            placeholder="Ej: Tercera fase del proyecto"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
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
              editingId ? handleUpdateItem(editingId) : handleAddItem()
            }
            disabled={!input.trim()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={16} />
            {editingId ? "Actualizar" : "Agregar elemento"}
          </button>
        </div>
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 py-6 text-center">
            <p className="text-sm text-slate-500">
              No hay elementos aún. Agrega el primer elemento arriba.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-600">
              {items.length} elemento{items.length !== 1 ? "s" : ""} en orden
            </p>
            <div className="space-y-1">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 hover:bg-slate-50 group"
                >
                  <GripVertical
                    size={16}
                    className="text-slate-400 opacity-0 group-hover:opacity-100"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 mb-1">
                      Posición {index + 1}
                    </div>
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {item.text}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="p-1 text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Mover arriba"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === items.length - 1}
                      className="p-1 text-slate-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Mover abajo"
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(item)}
                      className="px-2 py-1 text-xs rounded hover:bg-blue-100 text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
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
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs text-amber-800">
          <span className="font-semibold">💡 Consejo:</span> Define al menos 3-5 elementos para una buena actividad de ordenamiento. El alumno deberá ordenarlos correctamente.
        </p>
      </div>
    </div>
  );
}
