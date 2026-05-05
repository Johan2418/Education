import type { Dispatch, SetStateAction } from "react";
import DragAndDropActivity from "./DragAndDropActivity";
import FillInTheBlankActivity from "./FillInTheBlankActivity";
import InteractiveMapActivity from "./InteractiveMapActivity";
import type { NativeInteractiveConfig } from "@/features/lessons/services/interactivas";

interface NativeActivityRendererProps {
  config: NativeInteractiveConfig;
  answers: Record<string, string>;
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
  submitting: boolean;
  onSubmit: () => void;
  isEditor: boolean;
}

export default function NativeActivityRenderer({
  config,
  answers,
  setAnswers,
  submitting,
  onSubmit,
  isEditor,
}: NativeActivityRendererProps) {
  switch (config.activityType) {
    case "drag_and_drop":
      return (
        <DragAndDropActivity
          config={config}
          answers={answers}
          setAnswers={setAnswers}
          submitting={submitting}
          onSubmit={onSubmit}
          isEditor={isEditor}
        />
      );
    case "interactive_map":
      return (
        <InteractiveMapActivity
          config={config}
          answers={answers}
          setAnswers={setAnswers}
          submitting={submitting}
          onSubmit={onSubmit}
          isEditor={isEditor}
        />
      );
    case "fill_in_the_blank":
      return (
        <FillInTheBlankActivity
          config={config}
          answers={answers}
          setAnswers={setAnswers}
          submitting={submitting}
          onSubmit={onSubmit}
          isEditor={isEditor}
        />
      );
    default:
      return (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Tipo de actividad nativa no soportado aún</p>
          <p className="mt-2">Este tipo de actividad se renderizará en una próxima iteración.</p>
        </div>
      );
  }
}
