#!/bin/sh
set -eu

log() {
  echo "[ollama-bootstrap] $*"
}

trim() {
  echo "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

api_host() {
  if [ -n "${OLLAMA_HOST:-}" ]; then
    echo "${OLLAMA_HOST}"
    return
  fi
  echo "http://ollama:11434"
}

wait_for_ollama() {
  host="$1"
  retries=60
  while [ "$retries" -gt 0 ]; do
    if curl -fsS "$host/api/tags" >/dev/null 2>&1; then
      return 0
    fi
    retries=$((retries - 1))
    sleep 2
  done
  return 1
}

pull_model() {
  host="$1"
  model="$2"

  payload="$(jq -n --arg model "$model" '{model: $model, stream: false}')"
  log "pulling model: $model"
  curl -fsS -X POST "$host/api/pull" \
    -H 'Content-Type: application/json' \
    -d "$payload" >/dev/null
}

render_modelfile() {
  template_path="$1"
  base_model="$2"
  revision="$3"
  out_path="$4"

  sed \
    -e "s|__BASE_MODEL__|$base_model|g" \
    -e "s|__TRAINING_REVISION__|$revision|g" \
    "$template_path" > "$out_path"
}

create_specialized_model() {
  host="$1"
  model_tag="$2"
  base_model="$3"
  template_path="$4"
  revision="$5"

  tmp_file="$(mktemp)"
  render_modelfile "$template_path" "$base_model" "$revision" "$tmp_file"

  system_prompt="$(awk 'BEGIN{capture=0} /^SYSTEM \"\"\"/{capture=1; next} capture && /^\"\"\"/{capture=0; next} capture {print}' "$tmp_file")"

  params='{}'
  while IFS= read -r line; do
    key="$(echo "$line" | awk '{print $2}')"
    value="$(echo "$line" | awk '{print $3}')"
    if [ -z "$key" ] || [ -z "$value" ]; then
      continue
    fi
    params="$(echo "$params" | jq --arg key "$key" --arg value "$value" '. + {($key): (if ($value | test("^-?[0-9]+(\\.[0-9]+)?$")) then ($value | tonumber) else $value end)}')"
  done <<EOF
$(grep '^PARAMETER ' "$tmp_file" || true)
EOF

  payload="$(jq -n \
    --arg model "$model_tag" \
    --arg from "$base_model" \
    --arg system "$system_prompt" \
    --argjson parameters "$params" \
    '{model: $model, from: $from, system: $system, parameters: $parameters, stream: false}')"

  delete_payload="$(jq -n --arg model "$model_tag" '{model: $model}')"
  curl -sS -X POST "$host/api/delete" \
    -H 'Content-Type: application/json' \
    -d "$delete_payload" >/dev/null 2>&1 || true

  log "creating specialized model: $model_tag (base=$base_model, revision=$revision)"
  curl -fsS -X POST "$host/api/create" \
    -H 'Content-Type: application/json' \
    -d "$payload" >/dev/null

  rm -f "$tmp_file"
}

model_exists() {
  host="$1"
  model_tag="$2"

  tags_json="$(curl -fsS "$host/api/tags")"
  echo "$tags_json" | jq -e --arg model "$model_tag" '.models // [] | any(.name == $model)' >/dev/null 2>&1
}

main() {
  host="$(api_host)"
  analysis_model="${LIBRO_ANALYSIS_MODEL:-arcanea-analysis:latest}"
  mcp_model="${LIBRO_MCP_MODEL:-arcanea-mcp:latest}"
  analysis_base="${LIBRO_ANALYSIS_BASE_MODEL:-qwen2.5:latest}"
  mcp_base="${LIBRO_MCP_BASE_MODEL:-qwen2.5:3b}"
  revision="${LIBRO_MODEL_TRAINING_REVISION:-2026.05.0}"

  if ! wait_for_ollama "$host"; then
    log "ollama did not become healthy in time"
    exit 1
  fi

  raw_candidates="${OLLAMA_CANDIDATE_MODELS:-}"
  if [ -n "$raw_candidates" ]; then
    OLD_IFS="$IFS"
    IFS=','
    for item in $raw_candidates; do
      model="$(trim "$item")"
      if [ -z "$model" ]; then
        continue
      fi
      pull_model "$host" "$model"
    done
    IFS="$OLD_IFS"
  fi

  pull_model "$host" "$analysis_base"
  pull_model "$host" "$mcp_base"

  create_specialized_model "$host" "$analysis_model" "$analysis_base" "/opt/arcanea/ollama/modelfiles/analysis.Modelfile" "$revision"
  create_specialized_model "$host" "$mcp_model" "$mcp_base" "/opt/arcanea/ollama/modelfiles/mcp.Modelfile" "$revision"

  if ! model_exists "$host" "$analysis_model"; then
    log "analysis model not found after create: $analysis_model"
    exit 1
  fi
  if ! model_exists "$host" "$mcp_model"; then
    log "mcp model not found after create: $mcp_model"
    exit 1
  fi

  log "specialized models ready"
  curl -fsS "$host/api/tags" | jq -r '.models[]?.name'
}

main "$@"
