/**
 * Temperature warning helper for the LLM generation slider.
 *
 * Delta DVP PLCs run deterministic ladder/ST code in industrial environments.
 * High `temperature` values (above ~0.3) push the model toward creative but
 * syntactically/semantically unreliable output — broken I/O addresses, missing
 * rung comments, hallucinated instructions, etc. This helper exposes a single
 * severity level + message for the UI to render.
 *
 * Boundaries (see SettingsPanel temperature warning spec):
 *   t <  0.3   → 'none'   (no warning, safe industrial code)
 *   0.3 ≤ t ≤ 0.6 → 'warn'    (yellow, may produce inaccurate code)
 *   t >  0.6   → 'danger' (red, unreliable — not for production)
 */

export type TemperatureWarningLevel = 'none' | 'warn' | 'danger'

export interface TemperatureWarning {
  level: TemperatureWarningLevel
  message: string | null
}

export const TEMPERATURE_WARN_THRESHOLD = 0.3
export const TEMPERATURE_DANGER_THRESHOLD = 0.6
export const TEMPERATURE_MAX = 0.7

const WARN_MESSAGE = '⚠ قيم أعلى من 0.3 قد تنتج كوداً غير دقيق في بيئات الـ PLC الصناعية'
const DANGER_MESSAGE =
  '⚠ تحذير خطير: قيم أعلى من 0.6 تنتج كوداً غير موثوق — لا يُنصح بها في الإنتاج'

export function getTemperatureWarning(t: number): TemperatureWarning {
  if (t < TEMPERATURE_WARN_THRESHOLD) {
    return { level: 'none', message: null }
  }
  if (t <= TEMPERATURE_DANGER_THRESHOLD) {
    return { level: 'warn', message: WARN_MESSAGE }
  }
  return { level: 'danger', message: DANGER_MESSAGE }
}
