'use client'

import { useNovaBridge } from '@/components/platform/os/NovaBridgeRuntime'

export default function NovaBridgePage() {
  const bridge = useNovaBridge()
  const paired = bridge.phase === 'paired'
  const authorized = paired && bridge.voiceAuthorized
  const native = authorized && bridge.nativeVoice
  const phaseLabel = { ready: 'Väntar på anslutning', connecting: 'Ansluter…', paired: 'Ansluten', failed: 'Frånkopplad', paused: 'Pausad' }[bridge.phase]
  const busy = bridge.phase === 'connecting'

  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-zinc-100">
      <div className="rounded-3xl border border-cyan-500/25 bg-zinc-950/90 p-7 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Omnira / Nova Desktop</p>
        <h1 className="mt-2 text-2xl font-semibold">{authorized ? 'Nova är ansluten' : 'Anslut Novas röstsamtal'}</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-300" role="status" aria-live="polite">
          {bridge.message}
        </p>

        <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-400">Lokal anslutning</span>
            <span className="text-sm font-medium">{phaseLabel}</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-400">Novas röstsamtal</span>
            <span className="text-sm font-medium">{authorized ? bridge.voiceStatus : 'Inte anslutet'}</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => void bridge.connect()}
            disabled={busy || paired}
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white disabled:opacity-50">
            {paired ? 'Ansluten' : busy ? 'Ansluter…' : 'Anslut Nova'}
          </button>

          {!authorized && (
            <button type="button" onClick={() => void bridge.startNativeVoice()}
              disabled={!paired || !bridge.voiceAvailable}
              className="rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
              Koppla Windows-röst (Sanna)
            </button>
          )}

          {!authorized ? (
            <button type="button" onClick={() => void bridge.startVoice()}
              disabled={!paired || !bridge.voiceAvailable}
              className="rounded-xl bg-cyan-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
              Använd webbläsarens mikrofon
            </button>
          ) : (
            <button type="button" onClick={() => void bridge.stopVoice()}
              className="rounded-xl border border-rose-500/60 px-5 py-3 text-sm font-medium text-rose-200">
              Avsluta röstsamtal
            </button>
          )}

          {authorized && !bridge.nativeVoice && (!bridge.voiceMicActive || bridge.voiceMicProblem) && (
            <button type="button" onClick={bridge.retryMic}
              className="rounded-xl bg-cyan-700 px-5 py-3 text-sm font-semibold text-white">
              Aktivera mikrofon
            </button>
          )}

          <button type="button" onClick={bridge.pause}
            className="rounded-xl border border-zinc-700 px-5 py-3 text-sm text-zinc-300">
            Pausa kopplingen
          </button>
        </div>

        {authorized && !bridge.nativeVoice && (!bridge.voiceMicActive || bridge.voiceMicProblem) && (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-sm text-amber-200" role="alert">
            Atlas och Nova är anslutna, men mikrofonen är inte igång.
            {bridge.voiceMicProblem ? ' ' + bridge.voiceMicProblem : ' Webbläsaren kan kräva ett direkt klick för att aktivera ljud och mikrofon.'}
            {' '}Klicka Aktivera mikrofon.
          </p>
        )}

        {native && (
          <p className="mt-4 text-sm text-cyan-200" role="status">
            Sanna är Novas röst. Mikrofonens status visas i Nova-fönstret på datorn.
          </p>
        )}

        {!bridge.voiceAvailable && (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-sm text-amber-200">
            Atlas röstsamtal är inte aktiverat för den här användaren eller miljön. Den lokala Nova-bubblan kan fortfarande användas för godkänd navigering och läsning.
          </p>
        )}

        <div className="mt-7 border-t border-zinc-800 pt-5">
          <h2 className="text-sm font-semibold text-cyan-200">Så fungerar samtalet</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-300">
            {native ? (
              <>
                <li>Öppna Nova med <strong>Ctrl + Alt + Space</strong>. Säg exempelvis ”Hej Nova, starta Spotify”.</li>
                <li>Tryck <strong>Prata</strong> för att ge ett uppdrag utan att säga Novas namn. Det du säger till henne visas på LIVE-raden.</li>
                <li>Tryck <strong>Stopp</strong> eller minimera Nova för att stänga mikrofonen.</li>
              </>
            ) : (
              <>
                {!authorized && (
                  <li>Välj Windows-röst för att prata med Nova i skrivbordsfönstret, eller välj webbläsarens mikrofon för ett samtal här.</li>
                )}
                <li>Kalender- och andra ändringar använder Atlas vanliga behörigheter.</li>
                <li>Med webbläsarens mikrofon kan du behöva godkänna åtkomst i webbläsaren. Du kan avbryta ett pågående svar med <strong>Ctrl + Alt + .</strong>.</li>
              </>
            )}
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
          Låt Omnira-fliken vara öppen för Sannas röstsvar. Datoruppdrag med Desktop Commander hanteras i Nova-fönstret i Windows.
        </p>
      </div>
    </main>
  )
}
