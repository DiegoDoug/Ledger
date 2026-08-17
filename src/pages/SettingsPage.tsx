import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Field, Input, SegmentedControl, Select } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Modal'
import { Badge } from '../components/ui/Primitives'
import { ImportDialog } from '../components/ImportDialog'
import { useLedger } from '../data/store'
import { useToast } from '../components/ui/Toast'
import { useFormat } from '../lib/format'
import { writeTheme } from '../data/repositories'
import { REPOSITORY_LABELS } from '../data/repository'
import { formatMoney } from '../domain/money'
import { todayIso } from '../domain/dates'
import {
  buildBackup,
  exportFilename,
  parseBackup,
  transactionsToCsv,
} from '../domain/portability'
import type { BackupParseResult } from '../domain/portability'
import { downloadText, readFileAsText } from '../lib/download'
import {
  getAppDataDirectory,
  isDesktop,
  openDataDirectory,
  restoreJsonBackup,
  saveCsvExport,
  saveJsonBackup,
} from '../lib/desktop'
import { IconDownload, IconFolder, IconUpload } from '../components/icons'
import { cn } from '../lib/cn'
import { plural } from '../lib/plural'
import { APP_VERSION } from '../lib/version'
import type { LedgerData, Settings } from '../domain/types'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'INR', 'BRL']
const LOCALES = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'de-DE', label: 'German (Germany)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'ja-JP', label: 'Japanese (Japan)' },
]

export function SettingsPage() {
  const { data, actions, ephemeral, corrupt, storage, saving } = useLedger()
  const format = useFormat()
  const toast = useToast()

  const [name, setName] = useState(data.settings.profileName)
  const [confirming, setConfirming] = useState<'demo' | 'clear' | null>(null)
  const [importing, setImporting] = useState(false)
  const [recovering, setRecovering] = useState<'empty' | 'demo' | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [pendingRestore, setPendingRestore] = useState<{
    data: LedgerData
    exportedAt?: string
  } | null>(null)
  const [dataDir, setDataDir] = useState<string | null>(null)

  const sample = formatMoney(123456, {
    currency: data.settings.currency,
    locale: data.settings.locale,
  })

  const today = todayIso()
  const desktop = isDesktop()

  useEffect(() => {
    if (!desktop) return
    let cancelled = false
    void getAppDataDirectory().then((dir) => {
      if (!cancelled) setDataDir(dir)
    })
    return () => {
      cancelled = true
    }
  }, [desktop])

  async function handleExportCsv() {
    const filename = exportFilename('transactions', today)
    const csv = transactionsToCsv(data.transactions, data.accounts, data.categories)

    if (desktop) {
      const result = await saveCsvExport(csv, filename)
      if (!result.ok) {
        if (!result.cancelled) toast({ message: result.message, tone: 'error' })
        return
      }
    } else {
      downloadText(filename, csv, 'text/csv')
    }
    toast({
      message: `Exported ${plural(data.transactions.length, 'transaction')} as CSV.`,
      tone: 'success',
    })
  }

  async function handleExportJson() {
    const filename = exportFilename('backup', today)
    const backup = buildBackup(data)

    if (desktop) {
      const result = await saveJsonBackup(backup, filename)
      if (!result.ok) {
        if (!result.cancelled) toast({ message: result.message, tone: 'error' })
        return
      }
    } else {
      downloadText(filename, backup, 'application/json')
    }
    toast({ message: 'Exported a full backup.', tone: 'success' })
  }

  function applyParsedBackup(parsed: BackupParseResult) {
    if (!parsed.ok) {
      setRestoreError(parsed.error)
      return
    }
    setPendingRestore({ data: parsed.data, ...(parsed.exportedAt ? { exportedAt: parsed.exportedAt } : {}) })
  }

  async function handleRestoreFile(file: File | undefined, input: HTMLInputElement) {
    // Reset the input so picking the same file twice still fires a change event.
    input.value = ''
    if (!file) return
    setRestoreError(null)

    const read = await readFileAsText(file)
    if (!read.ok) {
      setRestoreError(read.error)
      return
    }
    applyParsedBackup(parseBackup(read.text))
  }

  async function handleRestoreNative() {
    setRestoreError(null)
    const read = await restoreJsonBackup()
    if (!read.ok) {
      if (!read.cancelled) setRestoreError(read.message)
      return
    }
    applyParsedBackup(parseBackup(read.text))
  }

  async function handleOpenDataDirectory() {
    try {
      await openDataDirectory()
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Could not open the data directory.',
        tone: 'error',
      })
    }
  }

  function setTheme(theme: Settings['theme']) {
    actions.updateSettings({ theme })
    writeTheme(theme)
    const dark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Preferences and data management. Everything is stored in this browser only."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" description="Shown in the sidebar." />
          <CardBody className="space-y-4">
            <Field label="Display name" htmlFor="settings-name">
              <Input
                id="settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  const trimmed = name.trim()
                  if (trimmed && trimmed !== data.settings.profileName) {
                    actions.updateSettings({ profileName: trimmed })
                    toast({ message: 'Display name updated.', tone: 'success' })
                  } else if (!trimmed) {
                    setName(data.settings.profileName)
                  }
                }}
                placeholder="Your name"
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Appearance"
            description="The theme is remembered separately from your ledger data."
          />
          <CardBody>
            <SegmentedControl
              name="theme"
              label="Theme"
              value={data.settings.theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Currency and formatting"
            description={`Amounts currently render as ${sample}.`}
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Currency" htmlFor="settings-currency">
              <Select
                id="settings-currency"
                value={data.settings.currency}
                onChange={(e) => actions.updateSettings({ currency: e.target.value })}
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Number format" htmlFor="settings-locale">
              <Select
                id="settings-locale"
                value={data.settings.locale}
                onChange={(e) => actions.updateSettings({ locale: e.target.value })}
              >
                {LOCALES.map((locale) => (
                  <option key={locale.value} value={locale.value}>
                    {locale.label}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Storage" description="Where your ledger lives." />
          <CardBody className="space-y-3 text-[13px] text-muted">
            <div className="flex items-center justify-between gap-3">
              <span>Persistence</span>
              {ephemeral ? (
                <Badge tone="warning">In memory only</Badge>
              ) : (
                <Badge tone="positive">Saved on this device</Badge>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Store</span>
              <span className="text-ink">{REPOSITORY_LABELS[storage]}</span>
            </div>
            {desktop ? (
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate" title={dataDir ?? undefined}>
                  Data directory{dataDir ? `: ${dataDir}` : ''}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void handleOpenDataDirectory()}
                >
                  <IconFolder className="h-3.5 w-3.5" />
                  Open
                </Button>
              </div>
            ) : null}
            <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3">
              <Stat label="Transactions" value={String(data.transactions.length)} />
              <Stat label="Accounts" value={String(data.accounts.length)} />
              <Stat label="Categories" value={String(data.categories.length)} />
              <Stat label="Budgets" value={String(data.budgets.length)} />
              <Stat label="Recurring rules" value={String(data.recurring.length)} />
              <Stat label="Saving" value={saving ? 'In progress' : 'Up to date'} />
            </dl>
            <p className="border-t border-line pt-3 text-xs">
              Ledger stores everything {desktop ? "in this app's own data directory" : 'in this browser'}{' '}
              on this device. Nothing is uploaded and there is no account. The data is{' '}
              <strong className="font-medium text-ink">not encrypted</strong> — anyone who can use this{' '}
              {desktop ? 'device' : 'browser profile'} can read it
              {desktop ? '' : ', and clearing your browser data deletes it'}. Export a backup to keep a
              copy.
            </p>
          </CardBody>
        </Card>
      </div>

      {corrupt ? (
        <Card className="mt-4 border-negative/40">
          <CardHeader
            title="Saved data could not be read"
            description="Ledger found a stored ledger it does not recognise, so it has stopped saving to avoid making things worse. Everything you do now lasts only until you reload."
          />
          <CardBody className="space-y-3">
            <p className="text-[13px] leading-relaxed text-muted">
              The unreadable data is still on this device. If you have a JSON backup, restore it
              below — that replaces the broken document and saving resumes. If you do not, you can
              discard it and start again. Either way, nothing is deleted until you choose.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" onClick={() => setRecovering('demo')}>
                Discard and load demo data
              </Button>
              <Button
                variant="secondary"
                className="text-negative"
                onClick={() => setRecovering('empty')}
              >
                Discard and start empty
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader
          title="Export"
          description="Your data belongs to you. Both formats are plain text you can open anywhere."
        />
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" onClick={handleExportCsv}>
              <IconDownload className="h-3.5 w-3.5" />
              Export transactions (CSV)
            </Button>
            <Button variant="secondary" onClick={handleExportJson}>
              <IconDownload className="h-3.5 w-3.5" />
              Export full backup (JSON)
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            The CSV holds every transaction in a spreadsheet-friendly layout and imports straight
            back into Ledger. The JSON backup is a complete snapshot — accounts, categories,
            budgets, recurring schedules, settings and transactions — and is what you restore from.
          </p>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Import"
          description="Bring in transactions from a bank export, or restore a Ledger backup."
        />
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <IconUpload className="h-3.5 w-3.5" />
              Import transactions (CSV)
            </Button>
            {desktop ? (
              <Button variant="secondary" onClick={() => void handleRestoreNative()}>
                <IconUpload className="h-3.5 w-3.5" />
                Restore backup (JSON)
              </Button>
            ) : (
              <label className="inline-flex">
                <span
                  className={cn(
                    'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong',
                    'bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-surface-muted',
                  )}
                >
                  <IconUpload className="h-3.5 w-3.5" />
                  Restore backup (JSON)
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    onChange={(e) => void handleRestoreFile(e.target.files?.[0], e.target)}
                  />
                </span>
              </label>
            )}
          </div>
          <p className="text-xs leading-relaxed text-muted">
            A CSV import shows you a preview first and reports every invalid or duplicate row before
            anything is added. Restoring a backup <strong className="font-medium text-ink">replaces</strong>{' '}
            everything currently stored, so export first if you want to keep it.
          </p>
          {restoreError ? (
            <p role="alert" className="text-[13px] text-negative">
              {restoreError}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card className="mt-4 border-negative/30">
        <CardHeader
          title="Reset data"
          description="Both actions replace everything currently stored. They can be undone straight away, but not after a reload."
        />
        <CardBody className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={() => setConfirming('demo')}>
            Restore demo data
          </Button>
          <Button
            variant="secondary"
            className="text-negative"
            onClick={() => setConfirming('clear')}
          >
            Delete everything
          </Button>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title="About Ledger" description="Version and behaviour." />
        <CardBody>
          <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
            <Row label="Version" value={APP_VERSION} />
            <Row label="Primary currency" value={format.currency} />
            <Row label="Storage" value={REPOSITORY_LABELS[storage]} />
            <Row label="Offline" value="Fully functional without a connection" />
          </dl>
          <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
            Ledger is a single-user, local-first application. There is no account, no server and no
            synchronisation — the data you see is the data in this browser. It is not shared between
            devices or browser profiles, and it offers no protection from anyone else using this
            device.
          </p>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirming === 'demo'}
        title="Restore demo data?"
        message="Your current ledger will be replaced with a fresh set of realistic sample transactions covering the last eight months."
        confirmLabel="Restore demo data"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          actions.resetToDemo()
          setConfirming(null)
          toast({
            message: 'Demo data restored.',
            tone: 'success',
            action: { label: 'Undo', onClick: actions.undo },
          })
        }}
      />

      <ConfirmDialog
        open={confirming === 'clear'}
        title="Delete everything?"
        message="All transactions, budgets, recurring schedules and accounts will be removed, leaving an empty ledger."
        confirmLabel="Delete everything"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          actions.clearAll()
          setConfirming(null)
          toast({
            message: 'Ledger cleared.',
            action: { label: 'Undo', onClick: actions.undo },
          })
        }}
      />

      <ConfirmDialog
        open={pendingRestore !== null}
        title="Restore this backup?"
        message={
          <>
            This will replace everything currently stored with the backup's{' '}
            <strong className="font-medium text-ink">
              {plural(pendingRestore?.data.transactions.length ?? 0, 'transaction')}
            </strong>{' '}
            across {plural(pendingRestore?.data.accounts.length ?? 0, 'account')}
            {pendingRestore?.exportedAt
              ? `, exported ${new Date(pendingRestore.exportedAt).toLocaleDateString(
                  data.settings.locale,
                )}`
              : ''}
            . You can undo it immediately afterwards, but not after a reload.
          </>
        }
        confirmLabel="Restore backup"
        onCancel={() => setPendingRestore(null)}
        onConfirm={() => {
          if (!pendingRestore) return
          actions.replaceAll(pendingRestore.data)
          toast({
            message: `Restored ${plural(pendingRestore.data.transactions.length, 'transaction')}.`,
            tone: 'success',
            action: { label: 'Undo', onClick: actions.undo },
          })
          setPendingRestore(null)
        }}
      />

      <ConfirmDialog
        open={recovering !== null}
        title="Discard the unreadable data?"
        message={
          <>
            The stored ledger Ledger could not read will be deleted permanently and replaced with{' '}
            {recovering === 'demo' ? 'fresh demo data' : 'an empty ledger'}. This cannot be undone.
            If you have a JSON backup, cancel and restore that instead.
          </>
        }
        confirmLabel="Discard and continue"
        onCancel={() => setRecovering(null)}
        onConfirm={() => {
          if (!recovering) return
          actions.discardCorruptData(recovering)
          setRecovering(null)
          toast({ message: 'Storage reset. Changes are being saved again.', tone: 'success' })
        }}
      />

      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="tnum mt-0.5 text-[15px] font-semibold text-ink">{value}</dd>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-b-0 sm:border-b-0 sm:pb-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  )
}
