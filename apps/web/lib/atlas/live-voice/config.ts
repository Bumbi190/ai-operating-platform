import 'server-only'

export type AtlasLiveVoice = 'marin' | 'cedar'

/** Server-owned configuration for the voice-quality trial, without business tools. */
export function buildAtlasLiveVoiceConfig(voice: AtlasLiveVoice) {
  if (voice !== 'marin' && voice !== 'cedar') throw new Error('unsupported_live_voice')
  return {
    model: 'gpt-live-1',
    audio: { output: { voice } },
    store: false,
    delegation: { type: 'client' },
    client: {
      data_channel: {
        allowed_client_events: ['session.close'],
        allowed_server_events: [
          { type: 'session.started' }, { type: 'session.closed' },
          { type: 'session.usage.updated' }, { type: 'session.input_transcript.delta' },
          { type: 'session.output_transcript.delta' }, { type: 'error' },
        ],
      },
    },
    instructions: `Du är Atlas, Andrés lugna och hjälpsamma samtalspartner.
Tala svenska med naturligt svenskt uttal, svenska vokaler och svensk betoning.
Svara vanligtvis med en eller två korta meningar. Tala varmt och avslappnat.
Låt användaren ta tankepauser och tala färdigt. Fråga kort om något är oklart.
Backchannel policy: Använd få, korta lyssnarljud som inte tar över samtalet.
Interruption policy: Sluta prata när användaren avbryter och lyssna på fortsättningen.
Delegation policy: Detta är ett separat rösttest. Du kan samtala men inte utföra uppgifter,
hämta projektuppgifter eller ändra något i Omnira. Säg det kort när det behövs.
Uttala svenska namn och ord naturligt: André, Hässleholm, Handlarbörsen och Familje-Stunden.`,
  }
}
