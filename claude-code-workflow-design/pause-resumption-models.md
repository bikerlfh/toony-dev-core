# Modelos de Pausa/Reanudación para Bot Control Plane

Cuando Claude Code está corriendo en modo headless y llega a un punto que necesita aprobación del usuario web (`approval: required` en el pipeline), el sistema necesita pausar, notificar, esperar respuesta, y reanudar.

Tres modelos posibles:

---

## Opción 1: Session Resume con `--resume`

Claude Code tiene un flag `--resume` que permite retomar una sesión previa con todo su contexto conversacional.

### Cómo funciona

1. El runner ejecuta `claude -p "/create-plan LIN-123"` — proceso que arranca, genera el plan, y **termina** (el proceso muere)
2. El runner manda el resultado al backend → el frontend muestra "Aprobación necesaria"
3. El usuario revisa y aprueba en la web
4. El runner lanza un **nuevo proceso**: `claude --resume <session-id> -p "Aprobado, continúa con /implement"`
5. Claude retoma con la memoria de la sesión anterior (sabe qué archivos leyó, qué plan hizo, etc.)

### Ventajas

- Cada etapa es un proceso limpio que nace y muere
- Si algo crashea, sabes exactamente dónde retomar
- Gracias a `--resume`, Claude no pierde el contexto de lo que hizo antes

### Desventajas

- Costo de "recalentamiento" — al resumir, Claude necesita recargar el contexto previo
- `--resume` tiene límites de contexto (si la sesión fue muy larga, puede perder detalles antiguos)

---

## Opción 2: Stage-by-Stage (sin resume, stateless)

Cada etapa es completamente independiente. No hay `--resume`. El contexto se pasa a través de **archivos en disco**.

### Cómo funciona

1. El runner ejecuta `claude -p "/create-plan LIN-123"` → Claude genera el plan y lo guarda en `.claude/workflow/plans/LIN-123.md`. El proceso **muere**.
2. El usuario aprueba en la web.
3. El runner ejecuta `claude -p "/implement LIN-123"` — proceso **totalmente nuevo**, sin conexión al anterior. Claude lee el plan desde el archivo en disco, lee el estado desde `state/LIN-123.json`, y trabaja desde ahí.

### Ventajas

- Máxima simplicidad
- Cada etapa es retry-able de forma independiente
- Si la etapa "test" falla, simplemente la re-ejecutas sin preocuparte por sesiones previas
- No depende de features de Claude Code como `--resume`

### Desventajas

- Claude no tiene "memoria conversacional" entre etapas
- Si en la etapa de plan descubrió algo importante sobre el codebase, tiene que redescubrirlo en la etapa de implementación (a menos que lo haya escrito en un archivo)
- Gasta más tokens re-leyendo contexto

---

## Opción 3: Long-Running Interactive Session ✅ (Seleccionada)

Un **único proceso** de Claude Code que se queda vivo durante todo el workflow. El runner mantiene `stdin`/`stdout` abiertos y actúa como intermediario.

### Cómo funciona

1. El runner ejecuta `claude --output-format stream-json` (sin `-p`, modo interactivo)
2. El runner escribe en stdin: `/workflow LIN-123`
3. Claude empieza a trabajar, streamea su output por stdout → el runner lo reenvía al backend → el frontend lo muestra en tiempo real
4. Claude llega al punto de aprobación y pregunta "¿Apruebas este plan?"
5. El runner detecta que es una pregunta de aprobación, notifica al backend
6. El usuario aprueba en la web
7. El runner escribe en stdin: `"Sí, aprobado. Continúa."`
8. Claude sigue trabajando **en el mismo proceso**, con todo el contexto en memoria

### Ventajas

- Máximo contexto — Claude recuerda absolutamente todo: cada archivo que leyó, cada decisión que tomó, cada patrón que encontró
- Experiencia más natural, como si el usuario estuviera sentado frente a la terminal
- Menor consumo de tokens (no re-lee contexto)

### Desventajas

- El proceso debe mantenerse vivo potencialmente por horas (mientras el usuario revisa el plan, almuerza, etc.)
- Si el proceso muere (crash, timeout, reinicio de la máquina), se pierde todo y hay que empezar de cero
- Detectar programáticamente cuándo Claude está "pidiendo aprobación" vs. simplemente "imprimiendo texto" requiere parsing inteligente del output

---

## Resumen Comparativo

|                                      | Resume         | Stateless       | Long-running    |
|--------------------------------------|----------------|-----------------|-----------------|
| **Contexto entre etapas**            | Alto (resume)  | Bajo (archivos) | Máximo (proceso)|
| **Resistencia a crashes**            | Alta           | Máxima          | Baja            |
| **Complejidad del runner**           | Media          | Baja            | Alta            |
| **Retry de etapas individuales**     | Posible        | Fácil           | Difícil         |
| **Consumo de tokens**                | Medio          | Alto (re-lee)   | Bajo            |
| **Dependencia en features de Claude**| `--resume`     | Ninguna         | stdin/stdout    |
