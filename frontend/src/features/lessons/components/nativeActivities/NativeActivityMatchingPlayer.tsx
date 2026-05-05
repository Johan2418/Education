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

export default function NativeActivityMatchingPlayer({
  config,
  answers,
  setAnswers,
  submitting,
  onSubmit,
  isEditor,
}: Props) {
  const questions = config.questions;
  const answerBank = Array.from(
    new Map(
      questions.flatMap((question) => question.options).map((option) => [option.id, option]),
    ).values(),
  );

  const assignedIds = new Set(Object.values(answers).filter(Boolean));
  const availableAnswers = answerBank.filter((option) => !assignedIds.has(option.id));

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, optionId: string) => {
    event.dataTransfer.setData("text/plain", optionId);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, questionId: string) => {
    event.preventDefault();
    const optionId = event.dataTransfer.getData("text/plain");
    if (!optionId) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const clearAnswer = (questionId: string) => {
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-emerald-300 bg-white p-4">
        <p className="text-sm font-semibold text-emerald-900">Emparejar</p>
        <p className="mt-1 text-sm text-slate-600">
          Arrastra cada opción desde el banco hacia la respuesta que le corresponde. Puedes cambiar una respuesta soltando otra encima o quitarla con el botón de limpiar.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          {questions.map((question, index) => {
            const selectedId = answers[question.id] || "";
            const selectedOption = answerBank.find((option) => option.id === selectedId);
            return (
              <div
                key={question.id}
                onDrop={(event) => handleDrop(event, question.id)}
                onDragOver={handleDragOver}
                className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600">Par {index + 1}</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{question.prompt}</p>
                  </div>
                  {selectedOption ? (
                    <button
                      type="button"
                      onClick={() => clearAnswer(question.id)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      Limpiar
                    </button>
                  ) : null}
                </div>

                <div className="min-h-[64px] rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-3 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40">
                  {selectedOption ? (
                    <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-900">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">✓</span>
                      {selectedOption.text}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Suelta aquí la respuesta correcta</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Banco de respuestas</p>
          <p className="mt-1 text-xs text-slate-500">Arrastra una respuesta hacia el par correcto.</p>
          <div className="mt-3 space-y-2">
            {availableAnswers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
                No quedan respuestas disponibles.
              </div>
            ) : availableAnswers.map((option) => (
              <button
                key={option.id}
                type="button"
                draggable
                onDragStart={(event) => handleDragStart(event, option.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 shadow-sm hover:border-emerald-300 hover:bg-emerald-50"
              >
                <span className="truncate">{option.text}</span>
                <span className="text-[11px] uppercase tracking-[0.15em] text-slate-400">Arrastrar</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {!isEditor && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="rounded-md bg-emerald-700 px-3 py-2 text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {submitting ? "Enviando..." : "Enviar actividad nativa"}
        </button>
      )}
    </div>
  );
}
