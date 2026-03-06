import { useEffect, useState } from "react";

interface Props {
  message: string;
  highlightSelector?: string;
  onDone: () => void;
}

export default function VisualAlert({ message, highlightSelector, onDone }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDone();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onDone]);

  useEffect(() => {
    if (!highlightSelector) return;
    try {
      const el = document.querySelector(highlightSelector) as HTMLElement | null;
      if (el) {
        el.style.outline = "3px solid #facc15";
        el.style.outlineOffset = "2px";
        const t = setTimeout(() => {
          el.style.outline = "";
          el.style.outlineOffset = "";
        }, 2000);
        return () => clearTimeout(t);
      }
    } catch { /* */ }
  }, [highlightSelector]);

  if (!visible) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-yellow-400 text-black px-6 py-3 rounded-lg shadow-lg animate-pulse font-semibold">
      {message}
    </div>
  );
}
