import { useMemo, useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Checkbox, Field, Select } from './ui/Field'
import { Badge, EmptyState } from './ui/Primitives'
import { useLedger } from '../data/store'
import { useToast } from './ui/Toast'
import { useFormat } from '../lib/format'
import { analyseCsvImport, CSV_COLUMNS } from '../domain/portability'
import type { ImportAnalysis, ImportOptions, ImportRow } from '../domain/portability'
import { readFileAsText } from '../lib/download'
import { importCsvFile, isDesktop } from '../lib/desktop'
import { TRANSACTION_TYPE_LABELS } from '../domain/types'
import { IconUpload } from './icons'
import { cn } from '../lib/cn'
import { plural } from '../lib/plural'

type Stage = 'pick' | 'preview'

const PREVIEW_LIMIT = 200

/**
 * Two-phase CSV import: analyse, show the user exactly what will happen, then
 * commit. Invalid and duplicate rows are always listed with a reason — nothing
 * is dropped without being reported.
 */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { data, actions } = useLedger()
  const format = useFormat()
  const toast = useToast()

  const [stage, setStage] = useState<Stage>('pick')
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState('')
  const [readError, setReadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const openAccounts = data.accounts.filter((a) => !a.archived)
  const [createMissing, setCreateMissing] = useState(false)
  const [includeDuplicates, setIncludeDuplicates] = useState(false)
  const [defaultAccountId, setDefaultAccountId] = useState(openAccounts[0]?.id ?? '')
  const [filter, setFilter] = useState<'all' | ImportRow['status']>('all')

  const options: ImportOptions = useMemo(
    () => ({
      createMissing,
      includeDuplicates,
      defaultAccountId: defaultAccountId || undefined,
      currency: data.settings.currency,
      locale: data.settings.locale,
    }),
    [createMissing, includeDuplicates, defaultAccountId, data.settings],
  )

  // Re-analysed whenever an option changes, so the preview always matches what
  // pressing Import would actually do.
  const analysis: ImportAnalysis | null = useMemo(
    () => (text ? analyseCsvImport(text, data, options) : null),
    [text, data, options],
  )

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setReadError(null)
    const result = await readFileAsText(file)
    setBusy(false)
    if (!result.ok) {
      setReadError(result.error)
      return
    }
    setFileName(file.name)
    setText(result.text)
    setStage('preview')
  }

  async function handleNativePick() {
    setBusy(true)
    setReadError(null)
    const result = await importCsvFile()
    setBusy(false)
    if (!result.ok) {
      if (!result.cancelled) setReadError(result.message)
      return
    }
    setFileName(result.filename)
    setText(result.text)
    setStage('preview')
  }

  function handleImport() {
    if (!analysis) return
    const result = actions.runImport(analysis, options)

    const parts = [`Imported ${plural(result.imported, 'transaction')}`]
    if (result.createdAccounts > 0) parts.push(`created ${plural(result.createdAccounts, 'account')}`)
    if (result.createdCategories > 0) {
      parts.push(`created ${plural(result.createdCategories, 'category', 'categories')}`)
    }
    if (result.skippedDuplicates > 0) parts.push(`skipped ${result.skippedDuplicates} duplicate`)
    if (result.skippedInvalid > 0) parts.push(`skipped ${result.skippedInvalid} invalid`)

    toast({
      message: `${parts.join(', ')}.`,
      tone: result.imported > 0 ? 'success' : 'neutral',
      action: { label: 'Undo', onClick: actions.undo },
    })
    onClose()
  }

  const rows = analysis?.rows ?? []
  const shown = (filter === 'all' ? rows : rows.filter((r) => r.status === filter)).slice(
    0,
    PREVIEW_LIMIT,
  )
  const willImport = analysis
    ? analysis.validCount + (includeDuplicates ? analysis.duplicateCount : 0)
    : 0

  return (
    <Modal
      open
      onClose={onClose}
      title="Import transactions from CSV"
      description={
        stage === 'pick'
          ? 'Nothing is added until you have reviewed the preview.'
          : `${fileName} — review before importing.`
      }
      size={stage === 'pick' ? 'sm' : 'lg'}
      footer={
        stage === 'pick' ? (
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setStage('pick')
                setText('')
                setFileName('')
              }}
            >
              Choose another file
            </Button>
            <div className="flex-1" />
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleImport} disabled={willImport === 0}>
              Import {willImport > 0 ? plural(willImport, 'transaction') : 'nothing'}
            </Button>
          </>
        )
      }
    >
      {stage === 'pick' ? (
        <div className="space-y-4">
          <label
            className={cn(
              'flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong',
              'bg-surface-muted/40 px-4 py-8 text-center transition-colors hover:border-accent/60',
            )}
          >
            <IconUpload className="h-5 w-5 text-muted" aria-hidden="true" />
            <span className="text-[13px] font-medium text-ink">
              {busy ? 'Reading file…' : 'Choose a CSV file'}
            </span>
            <span className="text-xs text-muted">or drop one here</span>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              data-autofocus
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </label>

          {isDesktop() ? (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => void handleNativePick()}
              disabled={busy}
            >
              <IconUpload className="h-3.5 w-3.5" />
              Choose with the system file picker
            </Button>
          ) : null}

          {readError ? (
            <p role="alert" className="text-[13px] text-negative">
              {readError}
            </p>
          ) : null}

          <div className="rounded-lg border border-line bg-surface-muted/40 p-3">
            <p className="text-xs font-medium text-ink">Expected columns</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              <span className="text-ink">Date</span>, <span className="text-ink">Description</span>{' '}
              and <span className="text-ink">Amount</span> are required. Type, Category, Account, To
              Account and Notes are optional. Common alternatives are recognised — Payee, Value,
              Posted Date, Memo — as are semicolon-separated files.
            </p>
            <p className="mt-2 text-xs text-subtle">
              Exporting from Ledger produces exactly this format: {CSV_COLUMNS.join(', ')}.
            </p>
          </div>
        </div>
      ) : !analysis ? null : analysis.fileErrors.length > 0 ? (
        <div className="space-y-3">
          {analysis.fileErrors.map((error) => (
            <p key={error} role="alert" className="text-[13px] leading-relaxed text-negative">
              {error}
            </p>
          ))}
          <p className="text-xs text-muted">
            The file needs a header row naming its columns. Nothing has been imported.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Summary label="Ready" value={analysis.validCount} tone="positive" />
            <Summary label="Duplicates" value={analysis.duplicateCount} tone="warning" />
            <Summary label="Invalid" value={analysis.invalidCount} tone="negative" />
          </div>

          <div className="space-y-3 rounded-lg border border-line bg-surface-muted/40 p-3">
            <Field
              label="Account for rows without one"
              htmlFor="import-default-account"
              hint="Used only when a row's account column is missing or blank."
            >
              <Select
                id="import-default-account"
                value={defaultAccountId}
                onChange={(e) => setDefaultAccountId(e.target.value)}
                aria-describedby="import-default-account-hint"
              >
                <option value="">Reject those rows</option>
                {openAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Checkbox
              label="Create accounts and categories named in the file"
              description={
                analysis.missingAccounts.length + analysis.missingCategories.length > 0
                  ? `Would create: ${[
                      ...analysis.missingAccounts.map((a) => a.name),
                      ...analysis.missingCategories.map((c) => c.name),
                    ]
                      .slice(0, 6)
                      .join(', ')}.`
                  : 'Every name in the file already exists.'
              }
              checked={createMissing}
              onChange={(e) => setCreateMissing(e.target.checked)}
            />

            <Checkbox
              label="Import rows that look like duplicates"
              description={
                analysis.duplicateCount > 0
                  ? `${plural(analysis.duplicateCount, 'row')} match something already recorded.`
                  : 'No duplicates found in this file.'
              }
              checked={includeDuplicates}
              onChange={(e) => setIncludeDuplicates(e.target.checked)}
              disabled={analysis.duplicateCount === 0}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Show</span>
            {(['all', 'valid', 'duplicate', 'invalid'] as const).map((value) => {
              const count =
                value === 'all'
                  ? rows.length
                  : value === 'valid'
                    ? analysis.validCount
                    : value === 'duplicate'
                      ? analysis.duplicateCount
                      : analysis.invalidCount
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                  className={cn(
                    'rounded-md border px-2 py-1 text-xs font-medium capitalize transition-colors',
                    filter === value
                      ? 'border-accent bg-accent-soft text-accent-text'
                      : 'border-line text-muted hover:text-ink',
                  )}
                >
                  {value === 'all' ? 'All' : value} ({count})
                </button>
              )
            })}
          </div>

          {shown.length === 0 ? (
            <EmptyState compact title="No rows in this view" />
          ) : (
            <div className="max-h-[22rem] overflow-auto scrollbar-thin rounded-lg border border-line">
              <table className="w-full min-w-[42rem] text-left text-[12px]">
                <thead className="sticky top-0 bg-surface-muted">
                  <tr className="border-b border-line text-[11px] uppercase tracking-[0.05em] text-subtle">
                    <th scope="col" className="px-2.5 py-2 font-medium">
                      Line
                    </th>
                    <th scope="col" className="px-2.5 py-2 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-2.5 py-2 font-medium">
                      Date
                    </th>
                    <th scope="col" className="px-2.5 py-2 font-medium">
                      Description
                    </th>
                    <th scope="col" className="px-2.5 py-2 text-right font-medium">
                      Amount
                    </th>
                    <th scope="col" className="px-2.5 py-2 font-medium">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.line} className="border-b border-line last:border-b-0 align-top">
                      <td className="tnum px-2.5 py-2 text-subtle">{row.line}</td>
                      <td className="px-2.5 py-2">
                        <Badge
                          tone={
                            row.status === 'valid'
                              ? 'positive'
                              : row.status === 'duplicate'
                                ? 'warning'
                                : 'negative'
                          }
                        >
                          {row.status === 'valid'
                            ? 'Ready'
                            : row.status === 'duplicate'
                              ? 'Duplicate'
                              : 'Invalid'}
                        </Badge>
                      </td>
                      <td className="tnum px-2.5 py-2 whitespace-nowrap text-muted">{row.date}</td>
                      <td className="px-2.5 py-2 text-ink">
                        {row.description || <span className="text-subtle">(empty)</span>}
                      </td>
                      <td className="tnum px-2.5 py-2 text-right whitespace-nowrap text-ink">
                        {row.amount}
                      </td>
                      <td className="px-2.5 py-2 text-muted">
                        <span className="block">
                          {TRANSACTION_TYPE_LABELS[
                            row.type as keyof typeof TRANSACTION_TYPE_LABELS
                          ] ?? row.type}
                          {row.category && row.category !== '—' ? ` · ${row.category}` : ''}
                          {row.account ? ` · ${row.account}` : ''}
                        </span>
                        {row.messages.map((message) => (
                          <span key={message} className="mt-0.5 block text-negative">
                            {message}
                          </span>
                        ))}
                        {row.warnings.map((warning) => (
                          <span key={warning} className="mt-0.5 block text-warning">
                            {warning}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > PREVIEW_LIMIT ? (
            <p className="text-xs text-subtle">
              Showing the first {PREVIEW_LIMIT} of {rows.length} rows. All{' '}
              {plural(willImport, 'valid row')} will still be imported.
            </p>
          ) : null}

          <p className="text-xs text-muted">
            {analysis.invalidCount > 0
              ? `${plural(analysis.invalidCount, 'row')} cannot be imported and will be skipped — fix them in the file and import again.`
              : 'Every row can be imported.'}{' '}
            Importing can be undone immediately afterwards.
          </p>
          <p className="sr-only" aria-live="polite">
            {willImport} of {rows.length} rows will be imported in {format.currency}.
          </p>
        </div>
      )}
    </Modal>
  )
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'positive' | 'warning' | 'negative'
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <p className="text-[11px] text-subtle">{label}</p>
      <p
        className={cn(
          'tnum mt-0.5 text-[17px] font-semibold',
          value === 0
            ? 'text-muted'
            : tone === 'positive'
              ? 'text-positive'
              : tone === 'warning'
                ? 'text-warning'
                : 'text-negative',
        )}
      >
        {value}
      </p>
    </div>
  )
}
