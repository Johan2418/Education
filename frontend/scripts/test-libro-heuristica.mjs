import assert from "node:assert/strict";

function isLikelyExercisePage(text) {
  const normalized = text.toLowerCase();
  if (normalized.length < 15) return false;

  const instructionMatches = (
    normalized.match(
      /\b(ejercicio(?:s)?|pregunta(?:s)?|problema(?:s)?|actividad(?:es)?|tarea(?:s)?|cuestionario|seccion|autoevaluacion|resuelve|responda|responde|complete|completa|selecciona|marca|indica|justifica|calcula)\b/g,
    ) || []
  ).length;
  const numberedItemMatches = (text.match(/(?:^|\s)(?:\d{1,2}[.)]|[a-dA-D][.)])\s+/g) || []).length;
  const questionMarkMatches = (text.match(/[¿?]/g) || []).length;
  const optionsMatches = (text.match(/(?:^|\s)[a-dA-D][.)]\s+/g) || []).length;
  const theoryMatches = (normalized.match(/\b(introduccion|objetivo|resumen|teoria|definicion|concepto|historia|explicacion|contenido)\b/g) || []).length;

  const score =
    instructionMatches * 2 +
    Math.min(numberedItemMatches, 4) * 2 +
    Math.min(questionMarkMatches, 3) +
    Math.min(optionsMatches, 3) -
    (theoryMatches >= 5 ? 2 : 0);

  if (score < 1) return false;

  return numberedItemMatches >= 1 || questionMarkMatches >= 1 || instructionMatches >= 1;
}

function choosePagesForTrabajos(parsedPages, candidatePages) {
  const minCandidatesThreshold = Math.ceil(parsedPages.length * 0.3);
  const shouldUseCandidates = candidatePages.length >= minCandidatesThreshold;
  return {
    minCandidatesThreshold,
    shouldUseCandidates,
    pagesForTrabajos: shouldUseCandidates ? candidatePages : parsedPages,
    skippedByRegex: shouldUseCandidates ? parsedPages.length - candidatePages.length : 0,
  };
}

function run(name, fn) {
  try {
    fn();
    console.log(`OK  ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

run("acepta nueva keyword 'pregunta'", () => {
  assert.equal(isLikelyExercisePage("¿Pregunta 1 de examen? Responde."), true);
});

run("acepta nueva keyword 'problema'", () => {
  assert.equal(isLikelyExercisePage("Problema 5: Calcula. a) Uno b) Dos"), true);
});

run("acepta OCR corto de 15 caracteres", () => {
  assert.equal(isLikelyExercisePage("Tarea: Completa"), true);
});

run("rechaza texto corto sin señal", () => {
  assert.equal(isLikelyExercisePage("Hola mundo"), false);
});

run("rechaza teoria pura", () => {
  const text = "Introduccion y teoria con definicion, concepto, historia y explicacion del contenido";
  assert.equal(isLikelyExercisePage(text), false);
});

run("acepta numeracion", () => {
  assert.equal(isLikelyExercisePage("1) Opcion uno\n2) Opcion dos"), true);
});

run("safeguard usa todas las paginas si filtro cae bajo 30%", () => {
  const parsed = Array.from({ length: 200 }, (_, i) => ({ page: i + 1 }));
  const candidates = parsed.slice(0, 48);
  const out = choosePagesForTrabajos(parsed, candidates);

  assert.equal(out.minCandidatesThreshold, 60);
  assert.equal(out.shouldUseCandidates, false);
  assert.equal(out.pagesForTrabajos.length, 200);
  assert.equal(out.skippedByRegex, 0);
});

run("safeguard usa candidatas cuando supera 30%", () => {
  const parsed = Array.from({ length: 200 }, (_, i) => ({ page: i + 1 }));
  const candidates = parsed.slice(0, 120);
  const out = choosePagesForTrabajos(parsed, candidates);

  assert.equal(out.minCandidatesThreshold, 60);
  assert.equal(out.shouldUseCandidates, true);
  assert.equal(out.pagesForTrabajos.length, 120);
  assert.equal(out.skippedByRegex, 80);
});

console.log("\nTodos los tests de heuristica de libro pasaron.");
