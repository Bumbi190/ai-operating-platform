'use client'

import { useNovaBridge } from '@/components/platform/os/NovaBridgeRuntime'

export default function NovaBridgePage() {
  const bridge = useNovaBridge()
  const paired = bridge.phase === 'paired'
  const busy = bridge.phase === 'connecting'

  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-zinc-100">
      <div className="rounded-3xl border border-cyan-500/25 bg-zinc-950/90 p-7 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Omnira / Nova Desktop</p>
        <h1 className="mt-2 text-2xl font-semibold">Anslut Novas röstsamtal</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-300" role="status" aria-live="polite">
          {bridge.message}
        </p>

        <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-400">Lokal anslutning</span>
            <span className="text-sm font-medium">{bridge.phase === 'paired' ? 'Ansluten' : bridge.phase}</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-400">Atlas röstsamtal</span>
            <span className="text-sm font-medium">{bridge.voiceAuthorized ? bridge.voiceStatus : 'Inte godkänt'}</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => void bridge.connect()}
            disabled={busy || paired}
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white disabled:opacity-50">
            {paired ? 'Ansluten' : busy ? 'Ansluter…' : 'Anslut Nova'}
          </button>

          {!bridge.voiceAuthorized ? (
            <button type="button" onClick={() => void bridge.startVoice()}
              disabled={!paired || !bridge.voiceAvailable}
              className="rounded-xl bg-cyan-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
              Starta röstsamtal
            </button>
          ) : (
            <button type="button" onClick={() => void bridge.stopVoice()}
              className="rounded-xl border border-rose-500/60 px-5 py-3 text-sm font-medium text-rose-200">
              Avsluta röstsamtal
            </button>
          )}

          <button type="button" onClick={bridge.pause}
            className="rounded-xl border border-zinc-700 px-5 py-3 text-sm text-zinc-300">
            Pausa kopplingen
          </button>
        </div>

        {!bridge.voiceAvailable && (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-sm text-amber-200">
            Atlas röstsamtal är inte aktiverat för den här användaren eller miljön. Den lokala Nova-bubblan kan fortfarande användas för godkänd navigering och läsning.
          </p>
        )}

        <div className="mt-7 border-t border-zinc-800 pt-5">
          <h2 className="text-sm font-semibold text-cyan-200">Så fungerar samtalet</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-300">
            <li>Du godkänner mikrofonen här en gång. Ingen dold inspelning startas före ditt klick.</li>
            <li>Under det här testet använder Nova en stabilare talöverföring: säg en hel mening och vänta ungefär två sekunder. Om hon inte svarar, öppna pratbubblan nere till höger och välj Mikrofontest.</li>
            <li>Atlas använder den befintliga inloggade Omnira-sessionen, rösten och samtalsmotorn.</li>
            <li>Efter godkännandet kan <strong>Ctrl + Alt + Space</strong> starta eller pausa samtalet från Nova Desktop.</li>
            <li><strong>Ctrl + Alt + .</strong> avbryter ett pågående Atlas-svar. Den synliga Stopp-knappen fungerar också.</li>
            <li>Samtalet ligger i Omniras globala skal och fortsätter när du byter sida inne i Omnira.</li>
            <li>Kalender- och andra ändringar använder Atlas vanliga behörigheter och eventuella godkännandesteg.</li>
          </ul>
        </div>

        {bridge.lastPrompt && (
          <section className="mt-7 border-t border-zinc-800 pt-5">
            <p className="text-xs text-indigo-300">Senaste lokala läsförfrågan från Nova</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">{bridge.lastPrompt}</p>
            <p className="mt-5 text-xs text-indigo-300">Atlas svar</p>
            <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-zinc-200">
              {bridge.lastAnswer || 'Väntar på svar…'}
            </p>
          </section>
        )}

        <p className="mt-7 text-xs leading-5 text-zinc-500">
          Den lokala Nova-bryggan har fortfarande inga egna skrivverktyg. Röstsamtalet går genom Atlas autentiserade konversationsmotor. Pairing-token ligger bara i minnet och tas bort ur adressfältet direkt.
        </p>
      </div>
    </main>
  )
}
