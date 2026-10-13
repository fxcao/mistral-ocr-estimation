export type OcrPage = {
  index: number
  markdown: string
  output_tokens_estimated: number
}

export type OcrRun = {
  id: number
  created_at: string
  source_name: string
  source_type: string
  model: string
  pages_processed: number
  doc_size_bytes: number | null
  prompt_tokens_estimated: number
  output_tokens_estimated: number
  cost_usd: number
  duration_ms: number
  pages?: OcrPage[]
  markdown_full?: string
  error?: string | null
}

export type RunSummary = Omit<OcrRun, 'pages' | 'markdown_full' | 'error'>

export type Totals = {
  run_count: number
  pages_total: number
  cost_total_usd: number
  output_tokens_total: number
}

export type Health = {
  status: string
  api_key_configured: boolean
  model: string
  usd_per_page: number
}
