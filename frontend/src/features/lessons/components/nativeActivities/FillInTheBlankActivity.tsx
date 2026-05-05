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

const BLANK_REGEX = /(___+)/;

export default function FillInTheBlankActivity({
  config,
  answers,
  setAnswers,
  submitting,
  onSubmit,
  isEditor,
}: Props) {
  const question = config.questions[0] ?? { id: "fill_blank_1", prompt: "", options: [] };
  const promptText = (config.fillBlankText?.trim() || question.prompt || "").trim();
  const correctAnswers = config.fillBlankAnswers?.map((text) => text.trim()).filter((text) => text) ?? [];
  const bankTexts = (config.fillBlankWordBank && config.fillBlankWordBank.length > 0)
    ? config.fillBlankWordBank.filter((word) => word.trim()).map((word) => word.trim())
    : question.options.map((option) => option.text.trim()).filter((text) => text);
  const allWords = Array.from(new Set([...bankTexts, ...correctAnswers]));

  const wordBank = allWords.map((text, index) => ({ id: `${question.id}_word_${index}`, text }));
  const assignedWordIds = new Set(Object.values(answers));
  const availableWords = wordBank.filter((word) => !assignedWordIds.has(word.id));

  let blankSequence = -1;
  const parts = promptText.split(BLANK_REGEX).map((part) => {
    const isBlank = BLANK_REGEX.test(part);
    if (isBlank) blankSequence += 1;
    return {
      part,
      isBlank,
      blankIndex: isBlank ? blankSequence : -1,
    };
  });
  const blankParts = parts.filter((segment) => segment.isBlank);
  const hasBlanks = blankParts.length > 0;

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, wordId: string) => {
    event.dataTransfer.setData("text/plain", wordId);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (event: DragEvent<HTMLElement>, blankIndex: number) => {
    event.preventDefault();
    const wordId = event.dataTransfer.getData("text/plain");
    if (!wordId) return;

    setAnswers((prev) => {
      const next = { ...prev };
      Object.entries(next).forEach(([key, value]) => {
        if (value === wordId) {
          delete next[key];
        }
      });
      next[`${question.id}:${blankIndex}`] = wordId;
      return next;
    });
  };

  const handleSelectWord = (wordId: string) => {
    const nextBlankIndex = blankParts.find((blankPart) => !getAssignedWord(blankPart.blankIndex))?.blankIndex;
    if (nextBlankIndex == null) return;

    setAnswers((prev) => {
      const next = { ...prev };
      Object.entries(next).forEach(([key, value]) => {
        if (value === wordId) {
          delete next[key];
        }
      });
      next[`${question.id}:${nextBlankIndex}`] = wordId;
      return next;
    });
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const getAssignedWord = (blankIndex: number) => {
    const answerKey = `${question.id}:${blankIndex}`;
    const selectedId = answers[answerKey] || "";
    return wordBank.find((word) => word.id === selectedId);
  };

  const clearBlank = (blankIndex: number) => {
    const answerKey = `${question.id}:${blankIndex}`;
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[answerKey];
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-emerald-300 bg-white p-3">
        <p className="text-sm font-semibold text-emerald-900">Completa los espacios arrastrando o tocando las palabras correctas</p>
        <p className="mt-1 text-sm text-slate-600">Arrastra una palabra del banco a cada espacio o tócala para asignarla al siguiente espacio vacío.</p>
      </div>

      {!hasBlanks ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No hay espacios configurados en el texto. Revisa la configuración de la actividad.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="prose prose-sm max-w-none text-slate-900">
            {parts.map((segment, index) => (
              segment.isBlank ? (
                <div
                  key={`blank-${index}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (getAssignedWord(segment.blankIndex)) {
                      clearBlank(segment.blankIndex);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      if (getAssignedWord(segment.blankIndex)) {
                        clearBlank(segment.blankIndex);
                      }
                    }
                  }}
                  onDrop={(event) => handleDrop(event, segment.blankIndex)}
                  onDragOver={handleDragOver}
                  onMouseDown={(event) => event.stopPropagation()}
                  className="inline-flex min-w-[120px] items-center justify-between gap-2 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-left text-sm text-slate-700 cursor-pointer"
                  style={{ userSelect: "text" }}
                >
                  <span className="min-w-[50px] text-left">
                    {getAssignedWord(segment.blankIndex)?.text || "Arrastra o toca aquí"}
                  </span>
                  {getAssignedWord(segment.blankIndex) ? (
                    <span className="text-xs text-slate-500 hover:text-slate-700">✕</span>
                  ) : null}
                </div>
              ) : (
                <span key={`text-${index}`} className="select-text">{segment.part}</span>
              )
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-800">Banco de palabras</p>
          <p className="text-xs text-slate-500">Toca una palabra para colocarla en el siguiente espacio vacío.</p>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {availableWords.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
              No quedan palabras disponibles.
            </div>
          ) : availableWords.map((word) => (
            <button
              key={word.id}
              type="button"
              draggable
              onDragStart={(event) => handleDragStart(event, word.id)}
              onClick={() => handleSelectWord(word.id)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
            >
              {word.text}
            </button>
          ))}
        </div>
      </div>

      {!isEditor && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || blankParts.length === 0}
          className="rounded-md bg-emerald-700 px-3 py-2 text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {submitting ? "Enviando..." : "Enviar actividad nativa"}
        </button>
      )}
    </div>
  );
}
