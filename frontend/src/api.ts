import type { Health, OcrRun, RunSummary, Totals } from './types'

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
    if (Array.isArray(data?.detail)) {
      return data.detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join(' ')
    }
    return JSON.stringify(data)
  } catch {
    return res.statusText || `Erreur HTTP ${res.status}`
  }
}

export async function fetchHealth(): Promise<Health> {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function fetchRuns(): Promise<{ runs: RunSummary[]; totals: Totals }> {
  const res = await fetch('/api/runs')
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function fetchRun(id: number): Promise<OcrRun> {
  const res = await fetch(`/api/runs/${id}`)
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function runOcrFile(file: File): Promise<OcrRun> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/ocr', { method: 'POST', body: form })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function runOcrUrl(url: string): Promise<OcrRun> {
  const res = await fetch('/api/ocr/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}
