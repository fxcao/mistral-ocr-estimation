import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { fetchHealth, fetchRun, fetchRuns, runOcrFile, runOcrUrl } from './api'
import type { Health, OcrRun, RunSummary, Totals } from './types'

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value)
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-600 text-sm font-bold text-white">
      {n}
    </span>
  )
}

function MetricCard({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string
  value: string
  hint?: string
  emphasize?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        emphasize
          ? 'border-orange-200 bg-orange-50'
          : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          emphasize ? 'text-orange-700' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [sourceMode, setSourceMode] = useState<'file' | 'url'>('file')
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<OcrRun | null>(null)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)

  const refreshHistory = useCallback(async () => {
    const data = await fetchRuns()
    setRuns(data.runs)
    setTotals(data.totals)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        setHealth(await fetchHealth())
        await refreshHistory()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
  }, [refreshHistory])

  const canSubmit = useMemo(() => {
    if (loading) return false
    if (sourceMode === 'file') return Boolean(file)
    return url.trim().length > 0
  }, [file, loading, sourceMode, url])

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) {
      setFile(dropped)
      setUrl('')
      setSourceMode('file')
      setError(null)
    }
  }

  const onSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      let result: OcrRun
      if (sourceMode === 'file' && file) {
        result = await runOcrFile(file)
      } else if (sourceMode === 'url' && url.trim()) {
        result = await runOcrUrl(url.trim())
      } else {
        throw new Error('Choisis un fichier ou une URL.')
      }
      setCurrent(result)
      await refreshHistory()
      window.setTimeout(() => {
        document.getElementById('resultats')?.scrollIntoView({ behavior: 'smooth' })
      }, 50)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const openRun = async (id: number) => {
    setLoading(true)
    setError(null)
    try {
      setCurrent(await fetchRun(id))
      document.getElementById('resultats')?.scrollIntoView({ behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="mb-8">
        <p className="text-sm font-semibold tracking-wide text-orange-600">
          Mistral · Workspace OCR
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Banc de test OCR
        </h1>
        <p className="mt-2 max-w-2xl text-base text-slate-600">
          En 3 étapes : choisis un document, lance l’OCR, lis le coût et le texte extrait.
        </p>
      </header>

      {!health?.api_key_configured ? (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Clé API manquante</p>
          <p className="mt-1 text-amber-900/90">
            Copie <code className="rounded bg-amber-100 px-1">backend/.env.example</code> vers{' '}
            <code className="rounded bg-amber-100 px-1">backend/.env</code>, renseigne{' '}
            <code className="rounded bg-amber-100 px-1">MISTRAL_API_KEY</code>, puis{' '}
            <code className="rounded bg-amber-100 px-1">make stop && make start</code>.
          </p>
        </div>
      ) : (
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800">
            Clé API OK
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-slate-600 ring-1 ring-slate-200">
            {health.model}
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-slate-600 ring-1 ring-slate-200">
            {formatUsd(health.usd_per_page)} / page
          </span>
        </div>
      )}

      <section className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <StepBadge n={1} />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Document à tester</h2>
              <p className="text-sm text-slate-500">Fichier local ou URL publique — pas les deux.</p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setSourceMode('file')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                sourceMode === 'file'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Fichier
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('url')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                sourceMode === 'url'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              URL
            </button>
          </div>

          {sourceMode === 'file' ? (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`rounded-2xl border-2 border-dashed px-5 py-8 text-center transition ${
                dragOver
                  ? 'border-orange-400 bg-orange-50'
                  : 'border-slate-300 bg-slate-50'
              }`}
            >
              <p className="text-base font-semibold text-slate-800">
                Glisse un PDF ou une image ici
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Formats : PDF, PNG, JPEG, WEBP — max 50 Mo
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Parcourir…
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const selected = e.target.files?.[0] ?? null
                  setFile(selected)
                  if (selected) {
                    setUrl('')
                    setSourceMode('file')
                  }
                }}
              />
              {file ? (
                <div className="mx-auto mt-4 max-w-md rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  <span className="font-semibold">Sélectionné :</span> {file.name}{' '}
                  <span className="text-emerald-700/80">({formatBytes(file.size)})</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <label htmlFor="doc-url" className="text-sm font-semibold text-slate-800">
                URL du document
              </label>
              <input
                id="doc-url"
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (e.target.value) setFile(null)
                }}
                placeholder="https://arxiv.org/pdf/2201.04234"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-orange-400/50 placeholder:text-slate-400 focus:ring-2"
              />
              <p className="mt-2 text-xs text-slate-500">
                Lien direct vers un PDF/image public (ex. un PDF arXiv).
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <StepBadge n={2} />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Lancer l’OCR</h2>
              <p className="text-sm text-slate-500">
                Facturé par Mistral : 4 USD / 1 000 pages.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void onSubmit()}
            className="rounded-xl bg-orange-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
          >
            {loading ? 'OCR en cours…' : 'Lancer le test'}
          </button>
          <p className="text-sm text-slate-500">
            {canSubmit
              ? sourceMode === 'file'
                ? `Document : ${file?.name}`
                : `URL prête`
              : 'Choisis d’abord un fichier ou une URL (étape 1).'}
          </p>
        </div>
      </section>

      {error ? (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p className="font-semibold">Erreur</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}

      <section id="resultats" className="mb-8">
        <div className="mb-4 flex items-center gap-3">
          <StepBadge n={3} />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Résultats & coûts</h2>
            <p className="text-sm text-slate-500">
              Pages facturées, tokens estimés (non facturés), markdown extrait.
            </p>
          </div>
        </div>

        {!current ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center text-sm text-slate-500">
            Aucun résultat pour l’instant. Lance un test à l’étape 2.
          </div>
        ) : (
          <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div>
              <p className="text-sm font-semibold text-orange-600">Run #{current.id}</p>
              <h3 className="text-xl font-bold text-slate-900">{current.source_name}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {formatDate(current.created_at)} · {current.model}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                label="Pages facturées"
                value={String(current.pages_processed)}
                hint="Relevé API Mistral"
                emphasize
              />
              <MetricCard
                label="Coût estimé"
                value={formatUsd(current.cost_usd)}
                hint="Tarif public × pages"
                emphasize
              />
              <MetricCard
                label="Durée"
                value={`${(current.duration_ms / 1000).toFixed(2)} s`}
              />
              <MetricCard
                label="Tokens output"
                value={current.output_tokens_estimated.toLocaleString('fr-FR')}
                hint="Estimation locale, non facturée"
              />
              <MetricCard
                label="Tokens prompt"
                value={String(current.prompt_tokens_estimated)}
                hint="OCR sans prompt texte"
              />
              <MetricCard
                label="Taille document"
                value={formatBytes(current.doc_size_bytes)}
              />
            </div>

            {current.pages && current.pages.length > 0 ? (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-800">Détail par page</h4>
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Page</th>
                        <th className="px-4 py-2.5 font-semibold">Tokens estimés</th>
                        <th className="px-4 py-2.5 font-semibold">Aperçu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.pages.map((page) => (
                        <tr key={page.index} className="border-t border-slate-100">
                          <td className="px-4 py-2.5 font-medium text-slate-800">
                            {page.index + 1}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-slate-700">
                            {page.output_tokens_estimated.toLocaleString('fr-FR')}
                          </td>
                          <td className="max-w-md truncate px-4 py-2.5 text-slate-500">
                            {page.markdown.slice(0, 120) || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-800">Markdown extrait</h4>
              <div className="prose-ocr max-h-[28rem] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                {current.markdown_full ? (
                  <ReactMarkdown>{current.markdown_full}</ReactMarkdown>
                ) : (
                  <p className="text-slate-500">Aucun contenu</p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Historique</h2>
            <p className="text-sm text-slate-500">Clique une ligne pour revoir le résultat.</p>
          </div>
          {totals ? (
            <p className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {totals.run_count} run(s) · {totals.pages_total} pages ·{' '}
              {formatUsd(totals.cost_total_usd)}
            </p>
          ) : null}
        </div>

        {runs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Vide pour l’instant.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">#</th>
                  <th className="px-3 py-2.5 font-semibold">Date</th>
                  <th className="px-3 py-2.5 font-semibold">Document</th>
                  <th className="px-3 py-2.5 font-semibold">Pages</th>
                  <th className="px-3 py-2.5 font-semibold">Tokens</th>
                  <th className="px-3 py-2.5 font-semibold">Coût</th>
                  <th className="px-3 py-2.5 font-semibold">Durée</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => void openRun(run.id)}
                    className={`cursor-pointer border-t border-slate-100 transition hover:bg-orange-50 ${
                      current?.id === run.id ? 'bg-orange-50' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 text-slate-700">{run.id}</td>
                    <td className="px-3 py-2.5 text-slate-500">{formatDate(run.created_at)}</td>
                    <td className="max-w-[14rem] truncate px-3 py-2.5 font-medium text-slate-800">
                      {run.source_name}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-700">
                      {run.pages_processed}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-700">
                      {run.output_tokens_estimated.toLocaleString('fr-FR')}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-700">
                      {formatUsd(run.cost_usd)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {(run.duration_ms / 1000).toFixed(1)} s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
