import { invoke } from '@tauri-apps/api/core'
import type { Project, RecentEntry } from '@/types/project'
import type { Settings, SecretTestResult, Provider } from '@/types/settings'
import type { LadderGraph } from '@/types/ladder'

function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err
  if (typeof err === 'string') return new Error(err)
  try {
    return new Error(JSON.stringify(err))
  } catch {
    return new Error('Unknown Tauri error')
  }
}

export type InvokeResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

export async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<InvokeResult<T>> {
  try {
    const data = await invoke<T>(cmd, args)
    return { data }
  } catch (err) {
    return { error: normalizeError(err).message }
  }
}

export async function projectNew(name: string): Promise<Project> {
  try {
    return await invoke<Project>('project_new', { name })
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function projectOpen(path: string): Promise<Project> {
  try {
    return await invoke<Project>('project_open', { path })
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function projectSave(project: Project): Promise<void> {
  try {
    await invoke<void>('project_save', { project })
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function projectSaveAs(project: Project, path: string): Promise<void> {
  try {
    await invoke<void>('project_save_as', { project, path })
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function projectListRecent(): Promise<RecentEntry[]> {
  try {
    return await invoke<RecentEntry[]>('project_list_recent')
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function projectClearActive(): Promise<void> {
  try {
    await invoke<void>('project_clear_active')
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function settingsGet(): Promise<Settings> {
  try {
    return await invoke<Settings>('settings_get')
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function settingsSet(settings: Settings): Promise<void> {
  try {
    await invoke<void>('settings_set', { settings })
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function secretSet(provider: Provider, key: string): Promise<void> {
  try {
    await invoke<void>('secret_set', { provider, key })
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function secretGet(provider: Provider): Promise<string | null> {
  try {
    return await invoke<string | null>('secret_get', { provider })
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function secretDelete(provider: Provider): Promise<void> {
  try {
    await invoke<void>('secret_delete', { provider })
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function secretTest(
  provider: Provider,
  key?: string,
  customBaseUrl?: string,
  customModelName?: string,
): Promise<SecretTestResult> {
  try {
    return await invoke<SecretTestResult>('secret_test', {
      provider,
      key,
      customBaseUrl,
      customModelName,
    })
  } catch (err) {
    throw normalizeError(err)
  }
}

export interface DvpModelSpec {
  family: 'ss2' | 'se' | 'sx2' | 'sv2'
  label: string
  max_x: number
  max_y: number
  max_m: number
  max_s: number | null
  max_t: number
  max_c: number
}

export async function dvpListModels(): Promise<{ data: DvpModelSpec[] } | { error: string }> {
  const result = await safeInvoke<{ models: DvpModelSpec[] }>('dvp_list_models')
  if (result.error) return { error: result.error }
  if (!result.data) return { error: 'No model data returned' }
  return { data: result.data.models }
}

/**
 * Authoritative Rust-side validation for a Delta DVP I/O address.
 * The frontend uses `validateDvpAddress` (src/lib/validators/dvpAddress.ts)
 * for fast inline UX; this command is the defense-in-depth layer that
 * can be invoked when an address arrives from an untrusted source
 * (file import, network sync, etc.).
 */
export async function dvpValidateAddress(addr: string): Promise<InvokeResult<void>> {
  return safeInvoke<void>('dvp_validate_address', { addr })
}

export async function generateCode(
  prompt: string,
  provider: string,
  model: string,
  apiKey: string,
  customBaseUrl?: string,
  customModelName?: string,
): Promise<InvokeResult<void>> {
  try {
    await invoke('generate_code', {
      prompt,
      provider,
      model,
      apiKey,
      customBaseUrl,
      customModelName,
    })
    return { data: undefined }
  } catch (err) {
    return { error: normalizeError(err).message }
  }
}

export async function renderLadder(st: string): Promise<InvokeResult<LadderGraph>> {
  return safeInvoke<LadderGraph>('render_ladder', { st })
}

// ---------------------------------------------------------------------------
// M7: AI Review & Safety
// ---------------------------------------------------------------------------

export type ConflictKind = 'undefined' | 'type-mismatch' | 'hmi-reserved'

export interface AddressConflict {
  address: string
  normalized: string
  kind: ConflictKind
  message: string
  line?: number
}

export interface ConflictReport {
  conflicts: AddressConflict[]
  totalAddresses: number
  conflictingAddresses: number
  shouldHalt: boolean
}

export interface ScanConflictsArgs {
  stCode: string
  ioTable: Array<{ address: string; type: string }>
  hmiReserved?: string[]
}

export interface ModelLimitResult {
  model: string
  xCount: number
  yCount: number
  mCount: number
  tCount: number
  cCount: number
  xExcess: number
  yExcess: number
  mExcess: number
  tExcess: number
  cExcess: number
  anyExcess: boolean
}

export async function scanCodeConflicts(
  args: ScanConflictsArgs,
): Promise<InvokeResult<ConflictReport>> {
  return safeInvoke<ConflictReport>('scan_code_conflicts', { args })
}

export async function checkModelLimits(
  model: string,
  ioTable: Array<{ address: string; type: string }>,
): Promise<InvokeResult<ModelLimitResult>> {
  return safeInvoke<ModelLimitResult>('check_model_limits', { model, ioTable })
}

// ---------------------------------------------------------------------------
// M6: Chat modification
// ---------------------------------------------------------------------------

export interface ModificationToken {
  payload: string
}

export interface ModificationDone {
  stCode: string
  ldGraph: LadderGraph | null
  rawResponse: string
}

export interface ModificationError {
  message: string
  kind?: string
}

export async function modifyCode(
  prompt: string,
  provider: string,
  model: string,
  apiKey: string,
  customBaseUrl?: string,
  customModelName?: string,
): Promise<InvokeResult<void>> {
  try {
    await invoke('modify_code', {
      prompt,
      provider,
      model,
      apiKey,
      customBaseUrl,
      customModelName,
    })
    return { data: undefined }
  } catch (err) {
    return { error: normalizeError(err).message }
  }
}

// Event listener helpers for modification stream
export type ModificationTokenHandler = (token: string) => void
export type ModificationDoneHandler = (done: ModificationDone) => void
export type ModificationErrorHandler = (error: ModificationError) => void

// ---------------------------------------------------------------------------
// M8: Export Pipeline
// ---------------------------------------------------------------------------

export async function exportXml(
  project: Project,
  path: string,
): Promise<InvokeResult<void>> {
  return safeInvoke<void>('export_xml', { project, path })
}

export async function exportCsv(
  project: Project,
  path: string,
): Promise<InvokeResult<void>> {
  return safeInvoke<void>('export_csv', { project, path })
}

export async function copyIlToClipboard(il: string): Promise<InvokeResult<void>> {
  return safeInvoke<void>('copy_il_to_clipboard', { il })
}

// ---------------------------------------------------------------------------
// M11.4 — Trust on First Use (Custom Provider domains)
// ---------------------------------------------------------------------------

export interface TrustedDomain {
  domain: string
  /** ISO 8601 timestamp. */
  trusted_at: string
}

export async function trustedDomainsList(): Promise<TrustedDomain[]> {
  try {
    return await invoke<TrustedDomain[]>('trusted_domains_list')
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function trustedDomainsAdd(domain: string): Promise<void> {
  try {
    await invoke<void>('trusted_domains_add', { domain })
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function trustedDomainsRemove(domain: string): Promise<void> {
  try {
    await invoke<void>('trusted_domains_remove', { domain })
  } catch (err) {
    throw normalizeError(err)
  }
}

export async function trustedDomainsIsTrusted(domain: string): Promise<boolean> {
  try {
    return await invoke<boolean>('trusted_domains_is_trusted', { domain })
  } catch (err) {
    throw normalizeError(err)
  }
}
