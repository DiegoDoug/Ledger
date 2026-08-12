import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Badge, EmptyState } from '../components/ui/Primitives'
import { Menu } from '../components/ui/Menu'
import { StatCard } from '../components/StatCard'
import { useLedger } from '../data/store'
import { useToast } from '../components/ui/Toast'
import { useFormat } from '../lib/format'
import { useUi } from '../App'
import {
  accountActivity,
  accountBalances,
  netWorth,
  transactionsInMonth,
} from '../domain/calculations'
import { monthKey, todayIso } from '../domain/dates'
import { parseAmountToCents } from '../domain/money'
import { IconPlus, IconWallet } from '../components/icons'
import { cn } from '../lib/cn'
import { plural } from '../lib/plural'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, isLiabilityAccount } from '../domain/types'
import type { Account, AccountType } from '../domain/types'

const ACCOUNT_TYPE_HINTS: Record<AccountType, string> = {
  checking: 'Everyday spending account',
  savings: 'Money set aside',
  credit: 'A negative balance is money owed and counts as a liability',
  cash: 'Physical money',
  investment: 'Contributions are tracked; market movement is not',
  other: 'Anything else',
}

export function AccountsPage() {
  const { data, actions } = useLedger()
  const format = useFormat()
  const toast = useToast()
  const ui = useUi()
  const navigate = useNavigate()
  const currentMonth = monthKey(todayIso())

  const [editing, setEditing] = useState<Account | null | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null)

  const balances = useMemo(
    () => accountBalances(data.accounts, data.transactions),
    [data.accounts, data.transactions],
  )

  const monthly = useMemo(
    () => transactionsInMonth(data.transactions, currentMonth),
    [data.transactions, currentMonth],
  )

  const active = data.accounts.filter((a) => !a.archived)
  const position = useMemo(
    () => netWorth(data.accounts, data.transactions),
    [data.accounts, data.transactions],
  )

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Balances are derived from each account's starting balance plus every transaction recorded against it."
        actions={
          <Button variant="primary" onClick={() => setEditing(null)}>
            <IconPlus className="h-3.5 w-3.5" />
            New account
          </Button>
        }
      />

      <section aria-label="Net position" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Net worth"
          value={format.money(position.netWorth)}
          tone={position.netWorth < 0 ? 'negative' : 'default'}
          meta={<p className="text-xs text-muted">Assets minus liabilities</p>}
        />
        <StatCard
          label="Assets"
          value={format.money(position.assets)}
          tone="positive"
          meta={<p className="text-xs text-muted">{plural(active.length, 'active account')}</p>}
        />
        <StatCard
          label="Liabilities"
          value={format.money(position.liabilities)}
          tone={position.liabilities > 0 ? 'negative' : 'default'}
          meta={<p className="text-xs text-muted">Card and overdrawn balances</p>}
        />
        <StatCard
          label="Spendable"
          value={format.money(position.totalBalance)}
          tone={position.totalBalance < 0 ? 'negative' : 'default'}
          meta={<p className="text-xs text-muted">Excludes credit cards</p>}
        />
      </section>

      {data.accounts.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={<IconWallet className="h-4 w-4" />}
            title="No accounts yet"
            description="Add the accounts you use so transactions can be attributed and balances calculated."
            action={
              <Button variant="primary" onClick={() => setEditing(null)}>
                <IconPlus className="h-3.5 w-3.5" />
                Add an account
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.accounts.map((account) => {
            const balance = balances.get(account.id) ?? 0
            const month = accountActivity(monthly, account.id)
            const count = accountActivity(data.transactions, account.id).count
            const liability = isLiabilityAccount(account.type)

            return (
              <Card key={account.id} className="flex flex-col">
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {account.name}
                      {account.archived ? <Badge tone="warning">Archived</Badge> : null}
                    </span>
                  }
                  description={account.institution}
                  actions={
                    <Menu
                      label={`Actions for ${account.name}`}
                      items={[
                        {
                          label: 'Add transaction',
                          onSelect: () => ui.newTransaction({ accountId: account.id }),
                        },
                        {
                          label: 'View transactions',
                          onSelect: () => navigate(`/transactions?account=${account.id}`),
                        },
                        { label: 'Edit account', onSelect: () => setEditing(account) },
                        {
                          label: account.archived ? 'Unarchive' : 'Archive',
                          onSelect: () => {
                            actions.updateAccount(account.id, { archived: !account.archived })
                            toast({
                              message: account.archived
                                ? `${account.name} is active again.`
                                : `${account.name} archived — it no longer counts towards your balance.`,
                              action: { label: 'Undo', onClick: actions.undo },
                            })
                          },
                        },
                        {
                          label: 'Delete',
                          destructive: true,
                          onSelect: () => setPendingDelete(account),
                        },
                      ]}
                    />
                  }
                />
                <CardBody className="flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="neutral">{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
                      {liability ? <Badge tone="neutral">Liability</Badge> : null}
                    </span>
                    <p
                      className={cn(
                        'tnum text-[19px] font-semibold tracking-[-0.02em]',
                        balance < 0 ? 'text-negative' : 'text-ink',
                      )}
                    >
                      {format.money(balance)}
                      <span className="sr-only">
                        {balance < 0 ? ' owed' : ' available'}
                      </span>
                    </p>
                  </div>
                  {liability && balance < 0 ? (
                    <p className="mt-1 text-right text-[11px] text-muted">
                      {format.money(Math.abs(balance))} owed
                    </p>
                  ) : null}

                  <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[11px]">
                    <div>
                      <dt className="text-subtle">In this month</dt>
                      <dd className="tnum mt-0.5 font-medium text-positive">
                        {format.money(month.moneyIn)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-subtle">Out this month</dt>
                      <dd className="tnum mt-0.5 font-medium text-ink">
                        {format.money(month.moneyOut)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-subtle">Transactions</dt>
                      <dd className="tnum mt-0.5 font-medium text-ink">{count}</dd>
                    </div>
                  </dl>
                  {account.notes ? (
                    <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
                      {account.notes}
                    </p>
                  ) : null}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      {editing !== undefined ? (
        <AccountDialog account={editing} onClose={() => setEditing(undefined)} />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this account?"
        message={
          <>
            <strong className="font-medium text-ink">{pendingDelete?.name}</strong> and the{' '}
            {pendingDelete ? accountActivity(data.transactions, pendingDelete.id).count : 0}{' '}
            transactions that touch it will be removed, which changes your totals. Transfers to or
            from this account go too. Archive it instead if you only want it out of the way.
          </>
        }
        confirmLabel="Delete account"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          actions.deleteAccount(pendingDelete.id)
          toast({
            message: `Deleted ${pendingDelete.name} and its transactions.`,
            action: { label: 'Undo', onClick: actions.undo },
          })
          setPendingDelete(null)
        }}
      />
    </>
  )
}

function AccountDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { data, actions } = useLedger()
  const format = useFormat()
  const toast = useToast()

  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking')
  const [institution, setInstitution] = useState(account?.institution ?? '')
  const [notes, setNotes] = useState(account?.notes ?? '')
  const [balance, setBalance] = useState(
    account ? (account.startingBalance / 100).toFixed(2) : '0.00',
  )
  const [errors, setErrors] = useState<{ name?: string; balance?: string }>({})

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const next: typeof errors = {}
    const trimmed = name.trim()
    if (!trimmed) next.name = 'Give the account a name.'
    else if (
      data.accounts.some(
        (a) => a.id !== account?.id && a.name.trim().toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      next.name = 'You already have an account with that name.'
    }
    const cents = parseAmountToCents(balance)
    if (balance.trim() === '') next.balance = 'Enter a starting balance (0 is fine).'
    else if (cents === null) next.balance = 'That is not a valid amount.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const payload = {
      name: trimmed,
      type,
      institution: institution.trim() || undefined,
      notes: notes.trim() || undefined,
      startingBalance: cents ?? 0,
      currency: data.settings.currency,
    }

    if (account) {
      actions.updateAccount(account.id, payload)
      toast({ message: `Updated ${payload.name}.`, tone: 'success' })
    } else {
      actions.addAccount(payload)
      toast({
        message: `Added ${payload.name}.`,
        tone: 'success',
        action: { label: 'Undo', onClick: actions.undo },
      })
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={account ? 'Edit account' : 'New account'}
      description="The starting balance is the position before your first recorded transaction."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="account-form">
            {account ? 'Save account' : 'Add account'}
          </Button>
        </>
      }
    >
      <form id="account-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Name" htmlFor="account-name" error={errors.name} required>
          <Input
            id="account-name"
            data-autofocus
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setErrors((p) => ({ ...p, name: undefined }))
            }}
            placeholder="Everyday Checking"
            invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'account-name-error' : undefined}
          />
        </Field>

        <Field label="Type" htmlFor="account-type" hint={ACCOUNT_TYPE_HINTS[type]}>
          <Select
            id="account-type"
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            aria-describedby="account-type-hint"
          >
            {ACCOUNT_TYPES.map((option) => (
              <option key={option} value={option}>
                {ACCOUNT_TYPE_LABELS[option]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Currency"
          htmlFor="account-currency"
          hint="Every account uses your primary currency. Ledger does not convert between currencies — change it in Settings."
        >
          <Input
            id="account-currency"
            value={data.settings.currency}
            readOnly
            disabled
            aria-describedby="account-currency-hint"
          />
        </Field>

        <Field
          label="Institution or reference"
          htmlFor="account-institution"
          hint="Optional — shown under the account name."
        >
          <Input
            id="account-institution"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="Meridian Bank ···· 4417"
          />
        </Field>

        <Field
          label="Opening balance"
          htmlFor="account-balance"
          error={errors.balance}
          hint="The position before your first recorded transaction. Use a negative amount for money owed, such as a credit card."
          required
        >
          <Input
            id="account-balance"
            inputMode="decimal"
            value={balance}
            prefix={format.symbol}
            onChange={(e) => {
              setBalance(e.target.value)
              setErrors((p) => ({ ...p, balance: undefined }))
            }}
            invalid={Boolean(errors.balance)}
            aria-describedby={errors.balance ? 'account-balance-error' : 'account-balance-hint'}
          />
        </Field>

        <Field
          label="Notes"
          htmlFor="account-notes"
          hint="Optional — shown on the account card."
        >
          <Textarea
            id="account-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Joint account with Sam."
            maxLength={300}
            aria-describedby="account-notes-hint"
          />
        </Field>
      </form>
    </Modal>
  )
}
