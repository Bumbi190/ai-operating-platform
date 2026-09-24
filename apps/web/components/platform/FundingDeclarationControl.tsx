'use client'

import { clearOperatingCapital, declareOperatingCapital } from '@/app/actions/survival-funding'
import { useState, useTransition } from 'react'

/**
 * The DECLARED OPERATING CAPITAL control (platform-operator only).
 *
 * ── WHAT THIS FIGURE IS ────────────────────────────────────────────────────
 * A runway input, and nothing else. It is not a budget, not a spend
 * authorization, not a wallet, bank or accounting balance, and not revenue. It
 * cannot widen an autonomy licence: `effectiveAutonomy = min(licensedAutonomy,
 * survivalCeiling)` is unchanged by whatever is entered here. It changes what
 * the survival observation reports, and that is the whole of its effect.
 *
 * ── AUTHORITY IS THE SERVER'S, NOT THIS BUTTON'S ───────────────────────────
 * Same contract as `PauseToggle`. The control is rendered for every operator,
 * but the button is not the authority: `declareOperatingCapital` /
 * `clearOperatingCapital` re-derive platform-operator identity from the verified
 * session on every call, and they take no actor argument — so there is nothing
 * here to spoof, and hiding the control for non-operators would make UI
 * visibility look like a permission boundary. A refusal is RENDERED, not
 * swallowed.
 *
 * ── CLEAR IS NOT ZERO ──────────────────────────────────────────────────────
 * These are two different facts and the UI keeps them apart. Clearing returns
 * the figure to UNDECLARED — "the owner makes no claim". Declaring 0 is a claim:
 * it says the owner has nothing left, which floors the survival state at
 * HIBERNATE. Collapsing them would let a cleared field read as a declaration of
 * ruin, or a declaration of ruin read as a cleared field.
 *
 * ── NO SURVIVAL LOGIC LIVES HERE ───────────────────────────────────────────
 * This component computes no state, no ceiling, no threshold and no runway. It
 * sends a number and renders what the server answered. `declaredSek` arrives
 * already derived from the canonical reader, so the field can never show a
 * figure the survival observation did not also see.
 */
export function FundingDeclarationControl({
  declaredSek,
  readable,
}: {
  /** The current declaration as the canonical reader reported it. Null = undeclared. */
  declaredSek: number | null
  /** False when the funding read failed. The field then shows nothing rather than a guess. */
  readable: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [amount, setAmount] = useState(declaredSek === null ? '' : String(declaredSek))

  // One refusal vocabulary for both actions, so a failed SET and a failed CLEAR
  // read the same way.
  const describe = (code: string | undefined) =>
    code === 'not_operator'
      ? 'Kräver plattformsoperatör'
      : code === 'invalid_amount'
        ? 'Ange ett belopp i SEK, t.ex. 120000 eller -500'
        : 'Kunde inte spara — försök igen'

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNote(null)
    const formData = new FormData()
    formData.set('declared_sek', amount)
    startTransition(async () => {
      const r = await declareOperatingCapital(formData)
      if (!r.ok) {
        setError(describe(r.error))
        return
      }
      // The server's answer is the truth, including whether anything was
      // written. "unchanged" is not a failure — it means this declaration was
      // already in force and no audit row was manufactured for a non-event.
      setAmount(r.declaredSek === null ? '' : String(r.declaredSek))
      if (!r.changed) setNote('Oförändrat — deklarationen hade redan detta värde.')
    })
  }

  const clear = () => {
    setError(null)
    setNote(null)
    startTransition(async () => {
      const r = await clearOperatingCapital()
      if (!r.ok) {
        setError(describe(r.error))
        return
      }
      setAmount('')
      if (!r.changed) setNote('Oförändrat — ingen deklaration fanns.')
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <label htmlFor="declared-sek" className="text-[12px] font-medium text-white/60">
          Driftkapital
        </label>
        <input
          id="declared-sek"
          name="declared_sek"
          // A text input, not `type="number"`: the server owns what counts as a
          // valid amount, and a browser that silently blanks a rejected value
          // would hide the refusal. Inputmode keeps the numeric keypad on mobile.
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={pending || !readable}
          placeholder="SEK"
          className="ease-os w-36 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-right text-[12px]
                     font-semibold text-white/90 tabular-nums placeholder:font-normal placeholder:text-white/30
                     disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending || !readable}
          className={`ease-os press inline-flex items-center rounded-lg border border-white/15 bg-white/10 px-3.5 py-2
                      text-[12px] font-semibold text-white/85 transition-all hover:bg-white/20
                      ${pending || !readable ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
        >
          {pending ? 'Sparar…' : 'Spara'}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={pending || !readable}
          title="Tar bort deklarationen. Detta är inte samma sak som att deklarera 0."
          className={`ease-os press inline-flex items-center rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5
                      py-2 text-[12px] font-semibold text-amber-200 transition-all hover:bg-amber-500/20
                      ${pending || !readable ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
        >
          Rensa deklaration
        </button>
      </form>

      {/* The distinction is stated in the reading order, never only in a tooltip. */}
      <p className="text-[11px] text-white/45">
        <strong className="font-semibold text-white/60">Rensa</strong> tar bort deklarationen — ägaren
        gör ingen anspråksanmälan. Att spara <strong className="font-semibold text-white/60">0</strong> är
        något annat: det är en deklaration om att inget återstår.
      </p>

      {error ? <p className="text-[11px] text-red-300">{error}</p> : null}
      {note ? <p className="text-[11px] text-white/50">{note}</p> : null}
      {!readable ? (
        <p className="text-[11px] text-white/50">
          Deklarationen kunde inte läsas, så fältet är tomt och kontrollen är avstängd. Ett tomt fält
          här betyder <em>okänt</em> — inte <em>ingen deklaration</em>.
        </p>
      ) : null}
    </div>
  )
}
