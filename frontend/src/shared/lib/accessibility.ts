export function speak(text: string): void {
  try {
    if (!window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(String(text));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch {
    // silently ignore
  }
}

export function notify(message: string, voiceEnabled: boolean): void {
  if (voiceEnabled) speak(message);
}
