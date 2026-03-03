# Arquitectura: Workflow de Desarrollo Configurable para Claude Code

## Visión General

Este documento describe una arquitectura para orquestar workflows de desarrollo completos con Claude Code, donde cada etapa del pipeline es configurable, opcional, y puede requerir (o no) aprobación humana. El sistema se construye exclusivamente sobre los mecanismos nativos de Claude Code: **skills**, **hooks**, **MCP servers**, **CLAUDE.md**, **worktrees** y el **modo headless** (`-p`).

---

## Filosofía de Diseño

El workflow no es un script monolítico — es un **pipeline declarativo** donde cada proyecto define qué etapas necesita, en qué orden, y cuál es el nivel de autonomía de cada una. Un proyecto de microservicios críticos podría requerir aprobación humana antes de cada commit; un proyecto de prototipado rápido podría correr todo en modo autónomo.

La clave es que **la misma infraestructura soporta ambos escenarios** simplemente cambiando configuración.

---

## Arquitectura por Capas

```
┌──────────────────────────────────────────────────────────────┐
│                     CAPA DE ORQUESTACIÓN                     │
│  Skill principal: /workflow                                  │
│  Lee pipeline.yml → ejecuta etapas → gestiona estado         │
├──────────────────────────────────────────────────────────────┤
│                     CAPA DE CONTEXTO                         │
│  CLAUDE.md: estándares del proyecto                          │
│  .claude/rules/: reglas por dominio (api/, frontend/, etc.)  │
├──────────────────────────────────────────────────────────────┤
│                     CAPA DE ETAPAS                           │
│  Skills individuales: /plan, /implement, /test, /pr          │
│  Cada etapa es un skill independiente e invocable            │
├──────────────────────────────────────────────────────────────┤
│                    CAPA DE CONTROL                           │
│  Hooks: validación pre/post, gates de aprobación             │
│  Settings: permission-mode por etapa                         │
├──────────────────────────────────────────────────────────────┤
│                   CAPA DE INTEGRACIÓN                        │
│  MCP servers: Linear, GitHub, Slack, métricas                │
│  CLI tools: gh, git, linear-cli                              │
├──────────────────────────────────────────────────────────────┤
│                   CAPA DE AISLAMIENTO                        │
│  Worktrees: cada tarea en su propia rama/directorio          │
│  Subagents: paralelización de trabajo independiente          │
└──────────────────────────────────────────────────────────────┘
```

---

## El Pipeline: Definición Declarativa

Cada proyecto define su workflow en `.claude/workflow/pipeline.yml`:

```yaml
# .claude/workflow/pipeline.yml
version: "1"
name: "Standard Development Workflow"

# Configuración global
defaults:
  approval: required          # required | auto | skip
  on_failure: stop            # stop | skip | retry
  notify: true

# Integrations
integrations:
  task_manager: linear        # linear | github-issues | jira
  vcs: github
  notifications: slack        # slack | discord | none

# Pipeline stages — se ejecutan en orden
stages:
  - id: fetch-task
    name: "Obtener tarea"
    skill: fetch-task
    approval: auto            # Override: no necesita aprobación
    inputs:
      source: linear
      status_filter: "In Progress"
      assignee: "me"

  - id: plan
    name: "Crear plan de implementación"
    skill: create-plan
    approval: required         # Humano revisa el plan antes de continuar
    outputs:
      - plan_file: ".claude/workflow/plans/{task_id}.md"

  - id: setup-worktree
    name: "Preparar entorno de trabajo"
    skill: setup-worktree
    approval: auto
    inputs:
      branch_pattern: "{task_id}/{short_description}"
    depends_on: [plan]

  - id: update-task-status
    name: "Notificar inicio de trabajo"
    skill: notify-task-manager
    approval: auto
    inputs:
      new_status: "In Development"
      comment: "Claude Code comenzó la implementación"
    parallel: true             # Puede correr en paralelo con implement

  - id: implement
    name: "Implementar cambios"
    skill: implement
    approval: auto             # Claude implementa sin interrupciones
    inputs:
      plan_from: plan
      worktree_from: setup-worktree
    timeout: 1800              # 30 min máximo

  - id: test
    name: "Ejecutar tests"
    skill: run-tests
    approval: auto
    on_failure: retry          # Override: reintentar si fallan tests
    max_retries: 2
    inputs:
      fix_on_failure: true     # Claude intenta arreglar tests fallidos

  - id: lint-format
    name: "Lint y formateo"
    skill: lint-format
    approval: auto
    on_failure: skip           # Si lint falla, no bloquea

  - id: commit
    name: "Crear commit"
    skill: smart-commit
    approval: required         # Humano revisa antes de commitear
    inputs:
      convention: conventional-commits
      include_task_id: true

  - id: create-pr
    name: "Crear Pull Request"
    skill: create-pr
    approval: required
    inputs:
      template: ".github/pull_request_template.md"
      link_task: true
      auto_assign_reviewers: true

  - id: notify-complete
    name: "Notificar finalización"
    skill: notify-task-manager
    approval: auto
    inputs:
      new_status: "In Review"
      comment: "PR creado: {pr_url}"
```

---

## Estructura de Directorio del Proyecto

```
my-project/
├── .claude/
│   ├── settings.json                    # Configuración de Claude Code
│   ├── settings.local.json              # Overrides locales (gitignored)
│   ├── CLAUDE.md                        # Instrucciones del proyecto
│   ├── rules/
│   │   ├── code-style.md               # Reglas de estilo
│   │   ├── testing.md                  # Reglas de testing
│   │   └── api/
│   │       └── conventions.md          # Reglas específicas de API
│   ├── skills/
│   │   ├── workflow/                   # Skill orquestador principal
│   │   │   └── SKILL.md
│   │   ├── fetch-task/                 # Obtener tarea de Linear
│   │   │   └── SKILL.md
│   │   ├── create-plan/               # Planificación
│   │   │   ├── SKILL.md
│   │   │   └── templates/
│   │   │       └── plan-template.md
│   │   ├── setup-worktree/            # Preparar worktree
│   │   │   └── SKILL.md
│   │   ├── implement/                 # Implementación
│   │   │   └── SKILL.md
│   │   ├── run-tests/                 # Testing
│   │   │   └── SKILL.md
│   │   ├── lint-format/               # Linting
│   │   │   └── SKILL.md
│   │   ├── smart-commit/              # Commits inteligentes
│   │   │   └── SKILL.md
│   │   ├── create-pr/                 # Pull Requests
│   │   │   └── SKILL.md
│   │   └── notify-task-manager/       # Notificaciones
│   │       └── SKILL.md
│   └── workflow/
│       ├── pipeline.yml               # Definición del pipeline
│       ├── plans/                     # Planes generados
│       └── state/                     # Estado de ejecución
├── .mcp.json                          # Servidores MCP del proyecto
├── CLAUDE.md                          # Raíz del proyecto
└── ...
```

---

## Diseño de Skills Clave

### 1. Skill Orquestador: `/workflow`

```yaml
# .claude/skills/workflow/SKILL.md
---
name: workflow
description: >
  Orquesta el pipeline completo de desarrollo. Lee la configuración
  de pipeline.yml y ejecuta cada etapa en secuencia, gestionando
  estado, aprobaciones y notificaciones.
argument-hint: "[task-id-or-url]"
allowed-tools: Read, Grep, Bash, Task
---

# Workflow Orchestrator

## Comportamiento

1. Lee `.claude/workflow/pipeline.yml` para obtener la definición del pipeline
2. Si se proporcionó un task ID/URL, úsalo. Si no, ejecuta la etapa `fetch-task`
3. Para cada etapa del pipeline:
   a. Verifica si tiene `depends_on` y si las dependencias están completadas
   b. Si `approval: required`, presenta al usuario qué va a hacer y espera confirmación
   c. Si `approval: auto`, ejecuta directamente
   d. Si `approval: skip`, salta la etapa
   e. Ejecuta el skill asociado pasando los inputs configurados
   f. Gestiona errores según `on_failure` (stop/skip/retry)
   g. Guarda el estado en `.claude/workflow/state/{task_id}.json`
4. Las etapas con `parallel: true` se ejecutan como subagents concurrentes

## Estado de Ejecución

Mantén un archivo de estado por tarea:

```json
{
  "task_id": "LIN-123",
  "pipeline": "Standard Development Workflow",
  "started_at": "2026-03-02T10:00:00Z",
  "current_stage": "implement",
  "stages": {
    "fetch-task": { "status": "completed", "duration": "3s" },
    "plan": { "status": "completed", "duration": "45s", "approved_by": "user" },
    "setup-worktree": { "status": "completed", "duration": "5s" },
    "implement": { "status": "in_progress", "started_at": "..." }
  }
}
```

## Resumabilidad

Si el workflow se interrumpe, al invocar `/workflow LIN-123` de nuevo,
lee el estado guardado y retoma desde la última etapa incompleta.
```

### 2. Skill: Obtener Tarea (`/fetch-task`)

```yaml
# .claude/skills/fetch-task/SKILL.md
---
name: fetch-task
description: >
  Obtiene la siguiente tarea asignada desde Linear. Extrae el ID,
  título, descripción, criterios de aceptación y prioridad.
allowed-tools: Bash, Read
---

# Fetch Task from Linear

## Instrucciones

Usa la CLI de Linear o el MCP de Linear para obtener la tarea.
El resultado dinámico de las tareas asignadas es:

!`linear issue list --assignee me --status "In Progress" --format json 2>/dev/null || echo "[]"`

Si hay múltiples tareas, presenta la lista al usuario para que elija.

Extrae y estructura la información:
- **task_id**: Identificador (e.g., LIN-123)
- **title**: Título de la tarea
- **description**: Descripción completa
- **acceptance_criteria**: Lista de criterios (si existen)
- **priority**: Urgente / Alta / Media / Baja
- **labels**: Etiquetas asociadas
- **related_issues**: Issues relacionados

Guarda el contexto en `.claude/workflow/state/current-task.json`
```

### 3. Skill: Crear Plan (`/create-plan`)

```yaml
# .claude/skills/create-plan/SKILL.md
---
name: create-plan
description: >
  Analiza la tarea y crea un plan de implementación detallado.
  Explora el codebase, identifica archivos relevantes, y produce
  un plan paso a paso.
allowed-tools: Read, Grep, Glob, Bash, Task
---

# Create Implementation Plan

## Proceso

1. Lee el contexto de la tarea desde `.claude/workflow/state/current-task.json`
2. Explora el codebase para entender la arquitectura relevante:
   - Usa Glob para encontrar archivos relacionados
   - Usa Grep para buscar patrones y dependencias
   - Lee los archivos clave identificados
3. Identifica:
   - Archivos que necesitan modificación
   - Archivos nuevos a crear
   - Dependencias afectadas
   - Tests existentes que cubren el área
   - Riesgos potenciales
4. Genera el plan usando la plantilla:

## Plantilla del Plan

```markdown
# Plan: {task_id} - {title}

## Contexto
[Resumen de la tarea y por qué es necesaria]

## Análisis del Codebase
[Qué se encontró explorando el código existente]

## Archivos Afectados
| Archivo | Acción | Descripción |
|---------|--------|-------------|
| src/... | Modificar | ... |
| src/... | Crear | ... |

## Pasos de Implementación
1. [Paso concreto con detalle de qué cambiar]
2. [Siguiente paso...]

## Tests
- [ ] Test unitario: ...
- [ ] Test de integración: ...

## Riesgos y Consideraciones
- [Riesgo identificado y mitigación]

## Estimación
- Complejidad: [Baja/Media/Alta]
- Archivos: N archivos a modificar, M nuevos
```

5. Guarda el plan en `.claude/workflow/plans/{task_id}.md`
```

### 4. Skill: Setup Worktree (`/setup-worktree`)

```yaml
# .claude/skills/setup-worktree/SKILL.md
---
name: setup-worktree
description: >
  Crea un git worktree aislado para trabajar en la tarea
  sin afectar la rama principal.
allowed-tools: Bash, Read
---

# Setup Git Worktree

## Instrucciones

1. Lee el task_id del estado actual
2. Genera un nombre de rama siguiendo el patrón configurado
3. Crea el worktree:

```bash
TASK_ID="..."
BRANCH_NAME="feat/${TASK_ID}/$(echo $TITLE | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | head -c 40)"
git worktree add ".claude/worktrees/${TASK_ID}" -b "$BRANCH_NAME"
```

4. Actualiza el estado con la ruta del worktree
5. Cambia el directorio de trabajo al worktree

## Limpieza

Al finalizar el workflow (después del PR), limpia:
```bash
git worktree remove ".claude/worktrees/${TASK_ID}"
```
```

### 5. Skill: Smart Commit (`/smart-commit`)

```yaml
# .claude/skills/smart-commit/SKILL.md
---
name: smart-commit
description: >
  Crea commits semánticos basados en los cambios realizados.
  Sigue conventional commits e incluye el task ID.
allowed-tools: Bash, Read, Grep
---

# Smart Commit

## Proceso

1. Ejecuta `git diff --staged --stat` y `git diff --staged` para analizar cambios
2. Determina el tipo de cambio: feat, fix, refactor, test, docs, chore
3. Genera mensaje siguiendo conventional commits:

```
{type}({scope}): {descripción concisa}

{cuerpo detallado de qué se cambió y por qué}

Refs: {task_id}
Co-Authored-By: Claude <noreply@anthropic.com>
```

4. Presenta el mensaje al usuario si `approval: required`
5. Ejecuta el commit
```

### 6. Skill: Create PR (`/create-pr`)

```yaml
# .claude/skills/create-pr/SKILL.md
---
name: create-pr
description: >
  Crea un Pull Request en GitHub con descripción generada
  automáticamente a partir de los commits y el plan.
allowed-tools: Bash, Read, Grep
---

# Create Pull Request

## Proceso

1. Lee el plan desde `.claude/workflow/plans/{task_id}.md`
2. Lee los commits con `git log main..HEAD --oneline`
3. Lee el template de PR si existe
4. Genera el cuerpo del PR:

```markdown
## Summary
[Resumen basado en el plan y los cambios]

## Changes
[Lista de cambios principales]

## Testing
[Qué tests se añadieron/modificaron]

## Linear Task
Closes LIN-{task_id}

---
🤖 Generated with Claude Code
```

5. Crea el PR:
```bash
gh pr create \
  --title "{type}({scope}): {título}" \
  --body "$(cat pr-body.md)" \
  --assignee @me
```

6. Si `auto_assign_reviewers: true`, usa CODEOWNERS o la config del equipo
7. Guarda la URL del PR en el estado
```

---

## Sistema de Hooks: Control y Validación

```jsonc
// .claude/settings.json
{
  "hooks": {
    // Gate de calidad antes de cada commit
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'INPUT=$(cat); CMD=$(echo $INPUT | jq -r \".tool_input.command // empty\"); if echo \"$CMD\" | grep -q \"^git commit\"; then echo \"{\\\"decision\\\": \\\"ask\\\", \\\"reason\\\": \\\"Commit detectado — verificar que tests pasen primero\\\"}\"; fi'",
            "timeout": 10
          }
        ]
      }
    ],

    // Notificación cuando Claude termina de trabajar
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/on-stop.sh",
            "timeout": 30,
            "async": true
          }
        ]
      }
    ],

    // Validación post-escritura de archivos
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/post-write-lint.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Scripts de hook ejemplo:

```bash
# .claude/hooks/on-stop.sh
#!/bin/bash
# Notifica al equipo cuando Claude termina una sesión de trabajo
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')

# Actualizar Linear
linear issue update "$CURRENT_TASK" \
  --comment "Claude Code finalizó sesión de trabajo (session: $SESSION_ID)"

# Notificar por Slack (si está configurado)
if [ -n "$SLACK_WEBHOOK" ]; then
  curl -s -X POST "$SLACK_WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d "{\"text\": \"🤖 Claude Code finalizó trabajo en $CURRENT_TASK\"}"
fi
```

```bash
# .claude/hooks/post-write-lint.sh
#!/bin/bash
# Lint automático después de cada escritura de archivo
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.file_path // empty')

if [ -z "$FILE" ]; then exit 0; fi

case "$FILE" in
  *.ts|*.tsx) npx eslint --fix "$FILE" 2>/dev/null ;;
  *.py) ruff check --fix "$FILE" 2>/dev/null ;;
  *.go) gofmt -w "$FILE" 2>/dev/null ;;
esac

exit 0
```

---

## Integración con MCP Servers

```jsonc
// .mcp.json
{
  "mcpServers": {
    // Linear para gestión de tareas
    "linear": {
      "type": "http",
      "url": "https://mcp.linear.app/sse",
      "headers": {
        "Authorization": "Bearer ${LINEAR_API_KEY}"
      }
    },

    // GitHub para PRs, issues, code review
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      }
    },

    // Servidor MCP custom para el workflow engine
    "workflow": {
      "type": "stdio",
      "command": "node",
      "args": [".claude/mcp/workflow-server.js"],
      "env": {
        "PIPELINE_CONFIG": ".claude/workflow/pipeline.yml",
        "STATE_DIR": ".claude/workflow/state"
      }
    }
  }
}
```

---

## CLAUDE.md del Proyecto

```markdown
<!-- CLAUDE.md -->
# Proyecto: Mi Aplicación

## Workflow de Desarrollo

Este proyecto usa un pipeline configurable de desarrollo.
Para iniciar el workflow completo: `/workflow`
Para iniciar con una tarea específica: `/workflow LIN-123`

## Estándares de Código

- TypeScript strict mode obligatorio
- Tests con Vitest, cobertura mínima 80%
- Conventional commits: feat|fix|refactor|test|docs|chore
- Cada PR debe referenciar un issue de Linear

## Estructura del Proyecto

- `src/api/` — Endpoints REST (Express)
- `src/services/` — Lógica de negocio
- `src/models/` — Modelos de datos (Prisma)
- `src/utils/` — Utilidades compartidas
- `tests/` — Tests organizados como mirror de src/

## Reglas de Revisión

Antes de crear un PR, verificar:
1. Todos los tests pasan (`npm test`)
2. Lint sin errores (`npm run lint`)
3. Build exitoso (`npm run build`)
4. No hay `console.log` en código de producción

Ver @.claude/rules/ para reglas específicas por dominio.
```

---

## Modo Headless: Automatización CI/CD

El workflow se puede invocar desde CI o desde un script:

```bash
#!/bin/bash
# run-workflow.sh — Ejecutar workflow completo en modo headless

TASK_ID=${1:?"Usage: ./run-workflow.sh <task-id>"}

# Modo totalmente autónomo
claude -p "/workflow $TASK_ID" \
  --allowedTools "Read,Grep,Glob,Bash,Edit,Write,Task" \
  --output-format json \
  --resume "$SESSION_FILE" \
  > workflow-output.json

# Extraer resultado
STATUS=$(jq -r '.result' workflow-output.json)
PR_URL=$(jq -r '.messages[-1].content' workflow-output.json | grep -oP 'https://github.com/\S+')

echo "Workflow completado: $STATUS"
echo "PR: $PR_URL"
```

```bash
# Modo semi-autónomo: plan requiere aprobación, resto automático
claude -p "/workflow $TASK_ID" \
  --permission-mode plan \
  --output-format stream-json
```

---

## Flujo Completo: Ejemplo con Linear + GitHub

```
 ┌─ TRIGGER ──────────────────────────────────────────────────┐
 │  Desarrollador ejecuta: /workflow                          │
 │  o en CI: claude -p "/workflow LIN-456"                    │
 └─────────────────────────┬──────────────────────────────────┘
                           │
 ┌─ FETCH TASK ────────────▼──────────────────────────────────┐
 │  🔄 Auto                                                   │
 │  → MCP Linear: obtener tarea LIN-456                       │
 │  → Extraer: título, descripción, criterios                 │
 │  → Guardar contexto en state/                              │
 └─────────────────────────┬──────────────────────────────────┘
                           │
 ┌─ CREATE PLAN ───────────▼──────────────────────────────────┐
 │  ⏸️  Requiere aprobación                                   │
 │  → Explorar codebase (Glob, Grep, Read)                    │
 │  → Identificar archivos afectados                          │
 │  → Generar plan detallado                                  │
 │  → Presentar al usuario: "¿Procedo con este plan?"         │
 │  → Usuario aprueba ✅ (o modifica)                          │
 └─────────────────────────┬──────────────────────────────────┘
                           │
 ┌─ SETUP + NOTIFY ────────▼──────────────────────────────────┐
 │  🔄 Auto (paralelo)                                        │
 │  ├→ Crear git worktree + branch                            │
 │  └→ Linear: mover a "In Development"                       │
 └─────────────────────────┬──────────────────────────────────┘
                           │
 ┌─ IMPLEMENT ─────────────▼──────────────────────────────────┐
 │  🔄 Auto                                                   │
 │  → Seguir el plan paso a paso                              │
 │  → Crear/modificar archivos                                │
 │  → Hook PostToolUse: lint automático por archivo            │
 │  → Timeout: 30 minutos máximo                              │
 └─────────────────────────┬──────────────────────────────────┘
                           │
 ┌─ TEST ──────────────────▼──────────────────────────────────┐
 │  🔄 Auto (con retry)                                       │
 │  → npm test                                                │
 │  → Si fallan: Claude intenta arreglarlos (max 2 intentos)  │
 │  → Si siguen fallando → on_failure: stop                   │
 └─────────────────────────┬──────────────────────────────────┘
                           │
 ┌─ COMMIT ────────────────▼──────────────────────────────────┐
 │  ⏸️  Requiere aprobación                                   │
 │  → Analizar diff completo                                  │
 │  → Generar mensaje conventional commit                     │
 │  → Presentar: "Commit: feat(auth): add OAuth2 flow         │
 │    [LIN-456]. ¿Confirmar?"                                 │
 │  → Usuario aprueba ✅                                       │
 └─────────────────────────┬──────────────────────────────────┘
                           │
 ┌─ CREATE PR ─────────────▼──────────────────────────────────┐
 │  ⏸️  Requiere aprobación                                   │
 │  → Generar descripción del PR                              │
 │  → Presentar preview al usuario                            │
 │  → gh pr create                                            │
 │  → Asignar reviewers                                       │
 └─────────────────────────┬──────────────────────────────────┘
                           │
 ┌─ NOTIFY ────────────────▼──────────────────────────────────┐
 │  🔄 Auto                                                   │
 │  → Linear: mover a "In Review", agregar link al PR         │
 │  → Slack: notificar al equipo (opcional)                   │
 │  → Limpiar worktree                                        │
 └────────────────────────────────────────────────────────────┘
```

---

## Variantes de Pipeline

### Pipeline Mínimo (Prototipado rápido)

```yaml
# .claude/workflow/pipeline.yml
version: "1"
name: "Quick Prototype"
defaults:
  approval: auto

stages:
  - id: implement
    skill: implement
    inputs:
      plan_from: inline  # Sin etapa de plan separada

  - id: commit
    skill: smart-commit

  - id: push
    skill: git-push
```

### Pipeline Enterprise (Máximo control)

```yaml
version: "1"
name: "Enterprise Workflow"
defaults:
  approval: required
  notify: true

stages:
  - id: fetch-task
    skill: fetch-task
    approval: auto

  - id: security-check
    name: "Verificación de seguridad pre-implementación"
    skill: security-scan
    approval: auto

  - id: plan
    skill: create-plan
    approval: required

  - id: architecture-review
    name: "Review de arquitectura por subagent"
    skill: arch-review
    inputs:
      reviewer_prompt: "Evalúa el plan desde perspectiva de escalabilidad"

  - id: setup-worktree
    skill: setup-worktree
    approval: auto

  - id: implement
    skill: implement
    approval: auto
    timeout: 3600

  - id: test
    skill: run-tests
    on_failure: stop
    # Sin retry en enterprise — si falla, el humano debe intervenir

  - id: security-scan-post
    name: "Escaneo de seguridad post-implementación"
    skill: security-scan
    inputs:
      scan_type: "diff-only"

  - id: commit
    skill: smart-commit
    approval: required

  - id: create-pr
    skill: create-pr
    approval: required
    inputs:
      require_security_review: true
      require_2_approvers: true

  - id: notify-complete
    skill: notify-task-manager
    approval: auto
```

---

## Gestión de Estado y Resumabilidad

Cada ejecución del workflow persiste su estado:

```
.claude/workflow/state/
├── LIN-456.json               # Estado de ejecución
├── LIN-456.log                # Log de cada etapa
└── current-task.json          # Tarea activa

.claude/workflow/plans/
├── LIN-456.md                 # Plan aprobado
└── LIN-789.md                 # Plan de otra tarea
```

Si Claude Code se interrumpe (crash, timeout, cierre accidental), al ejecutar `/workflow LIN-456` de nuevo:

1. Lee `state/LIN-456.json`
2. Identifica la última etapa completada
3. Retoma desde la siguiente etapa
4. El worktree y los cambios persisten entre sesiones

---

## Decisiones de Diseño Clave

**¿Por qué skills y no un script externo?** Porque los skills tienen acceso completo al contexto de Claude Code: pueden explorar el codebase, razonar sobre el código, y tomar decisiones inteligentes. Un script bash solo puede ejecutar comandos predefinidos.

**¿Por qué YAML para el pipeline?** Es legible, diffable en git, y fácil de modificar. JSON sería más estricto pero menos ergonómico para configuración humana.

**¿Por qué hooks en lugar de validación inline?** Los hooks corren fuera del contexto de Claude, lo que los hace más rápidos, deterministas, y auditables. Un lint en un hook siempre se ejecuta; una instrucción en CLAUDE.md podría ser ignorada.

**¿Por qué worktrees?** Permiten trabajar en múltiples tareas en paralelo sin conflictos de branches. Si Claude trabaja en LIN-456 y hay un hotfix urgente LIN-789, puede crear otro worktree sin perder el progreso.

**¿Por qué estado en archivos JSON?** Simplicidad. No necesitamos una base de datos. Los archivos son versionables, inspeccionables, y sobreviven entre sesiones de Claude Code.

---

## Consideraciones para Implementación

Para llevar esta arquitectura a la práctica, el trabajo se descompone en:

1. **Crear los skills base**: Empezar con `workflow`, `create-plan`, `smart-commit`, y `create-pr` — estos cubren el 80% del valor.

2. **Configurar MCP de Linear**: Conectar Linear como fuente de tareas. Si Linear no tiene MCP oficial, usar un servidor MCP custom que wrappee su API REST.

3. **Escribir los hooks**: El hook de `post-write-lint` y el de `on-stop notification` son los de mayor impacto inmediato.

4. **Definir el primer `pipeline.yml`**: Empezar con un pipeline de 4-5 etapas e iterar.

5. **Iterar**: Agregar etapas según las necesidades reales del equipo. La arquitectura está diseñada para que agregar una etapa nueva sea simplemente añadir un skill y una entrada en el YAML.
