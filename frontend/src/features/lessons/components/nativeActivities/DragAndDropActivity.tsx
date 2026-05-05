import type { Dispatch, DragEvent, SetStateAction } from "react";
import type { NativeInteractiveConfig } from "@/features/lessons/services/interactivas";

interface Props {
  config: NativeInteractiveConfig;
  answers: Record<string, string>;
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
  submitting: boolean;
  onSubmit: () => void;
  isEditor: boolean;
}

export default function DragAndDropActivity({
  config,
  answers,
  setAnswers,
  submitting,
  onSubmit,
  isEditor,
}: Props) {
  const categories = config.dragAndDropCategories ?? [];
  const items = config.dragAndDropItems ?? [];
  const unassignedItems = items.filter((item) => !answers[item.id]);

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, itemId: string) => {
    event.dataTransfer.setData("text/plain", itemId);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, categoryId: string) => {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("text/plain");
    if (!itemId) return;
    setAnswers((prev) => ({ ...prev, [itemId]: categoryId }));
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-emerald-300 bg-white p-3">
        <p className="text-sm font-semibold text-emerald-900">Arrastra los elementos a la categoría correcta</p>
        <p className="mt-1 text-sm text-slate-600">Arrastra un elemento desde el listado sin asignar y suéltalo en una categoría.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800 mb-3">Sin asignar</p>
          <div className="space-y-2">
            {unassignedItems.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">Todos los elementos están asignados.</div>
            ) : (
              unassignedItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  draggable
                  onDragStart={(event) => handleDragStart(event, item.id)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                >
                  {item.label}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-4">
          {categories.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              No se han configurado categorías para esta actividad.
            </div>
          ) : categories.map((category) => (
            <div
              key={category.id}
              onDrop={(event) => handleDrop(event, category.id)}
              onDragOver={handleDragOver}
              className="rounded-lg border border-slate-200 bg-white p-3 min-h-[150px]"
            >
              <p className="text-sm font-semibold text-slate-900 mb-3">{category.label}</p>
              <div className="space-y-2">
                {items.filter((item) => answers[item.id] === category.id).map((item) => (
                  <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!isEditor && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || items.length === 0}
          className="rounded-md bg-emerald-700 px-3 py-2 text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {submitting ? "Enviando..." : "Enviar actividad nativa"}
        </button>
      )}
    </div>
  );
}
