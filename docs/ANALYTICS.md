# Análisis y reportes

La sección **Análisis** (`/analytics`) ofrece reportes interactivos por empresa (tenant), con filtros, agrupaciones, tabla pivot y exportación CSV.

## Acceso

| Rol | Permiso |
|-----|---------|
| `super_admin` | Sí — puede cambiar de empresa con la barra de contexto |
| `admin` | Sí — solo su empresa asignada |
| `viewer` | Sí — solo lectura |
| `playground` | No |

URL producción: https://paymercadogo.com/callmgmt/analytics

## Filtros disponibles

| Filtro | Descripción |
|--------|-------------|
| Rango de fechas | `date_from` / `date_to` (ISO date) |
| Outcomes | Multi-selección (`resolved`, `abandoned`, etc.) |
| Agentes | Instancias de agente de la empresa |
| Teléfono origen | Búsqueda parcial (`LIKE`) |
| Duración | Mínimo y máximo en segundos |
| Filtros personalizados | Reglas campo + operador + valor |

### Operadores de filtros personalizados

| Operador | Uso |
|----------|-----|
| `eq` | Igual a |
| `neq` | Distinto de |
| `contains` | Contiene (texto) |
| `gte` / `lte` | Mayor o igual / menor o igual |
| `in` | Lista separada por comas |

Campos permitidos: `outcome`, `agent_instance_id`, `from_number`, `to_number`, `duration_seconds`, `start_time`.

## Dimensiones de agrupación y pivot

| ID | Etiqueta |
|----|----------|
| `day` | Día |
| `hour` | Hora del día |
| `weekday` | Día de la semana |
| `outcome` | Resultado de la llamada |
| `agent` | Instancia de agente |
| `month` | Mes (YYYY-MM) |

**Métricas:** `count` (cantidad), `sum_duration` (duración total en segundos), `avg_duration` (promedio).

## Vistas en la UI

1. **Resumen** — KPIs + gráfico donut por outcome
2. **Series** — barras según dimensión de agrupación
3. **Pivot** — tabla filas × columnas con heatmap y totales
4. **Detalle** — hasta 100 filas del resultado filtrado + export CSV

### Presets

Los presets se guardan en `localStorage` del navegador (`callmgmt-report-presets`). Útiles para reportes recurrentes (ej. “Llamadas abandonadas última semana”).

## API

### Opciones de filtro

```http
GET /api/reports/options
Header: X-Tenant-Id: <tenant_id>
```

Respuesta: outcomes, agentes, rango de fechas en datos, dimensiones y métricas.

### Ejecutar reporte (GET — filtros simples)

```http
GET /api/reports/calls?date_from=2026-06-01&date_to=2026-06-30&group_by=day&pivot_row=weekday&pivot_col=outcome&metric=count
```

Parámetros CSV para listas: `outcomes=resolved,abandoned`, `agent_instance_ids=id1,id2`.

### Ejecutar reporte (POST — filtros personalizados)

```http
POST /api/reports/calls
Content-Type: application/json

{
  "date_from": "2026-06-01",
  "date_to": "2026-06-30",
  "group_by": "day",
  "pivot_row": "weekday",
  "pivot_col": "outcome",
  "metric": "count",
  "custom_filters": [
    { "field": "duration_seconds", "op": "gte", "value": 60 }
  ]
}
```

### Respuesta

```json
{
  "summary": {
    "total_calls": 42,
    "avg_duration_seconds": 95,
    "total_duration_seconds": 3990,
    "unique_callers": 28
  },
  "series": [{ "key": "2026-06-01", "label": "2026-06-01", "count": 5, "sum_duration": 400, "avg_duration": 80 }],
  "outcome_breakdown": [{ "key": "resolved", "label": "resolved", "count": 30, ... }],
  "pivot": {
    "row_dimension": "weekday",
    "col_dimension": "outcome",
    "row_labels": ["Lun", "Mar"],
    "col_labels": ["resolved", "abandoned"],
    "cells": [[3, 1], [2, 0]]
  },
  "detail": [{ "call_id": "...", "from_number": "+502...", ... }],
  "filters_applied": { ... }
}
```

## Datos de origen

Los reportes leen `call_records` del CRM SQLite del tenant activo (`data/tenants/{tenant_id}/crm.db`). Campos relevantes:

- `start_time`, `duration_seconds`, `outcome`
- `from_number`, `to_number`
- `agent_instance_id`, `transcript`, `recording_url`

## Exportación

Desde la UI: botones **Exportar CSV** en pestañas Pivot y Detalle. Los archivos se descargan en el navegador (`pivot-llamadas.csv`, `llamadas-detalle.csv`).