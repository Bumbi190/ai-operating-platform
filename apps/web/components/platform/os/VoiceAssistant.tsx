'use client'

/**
 * @deprecated P1A — VoiceAssistant är ersatt av AtlasRuntimeProvider.
 *
 * All röst- och konversationslogik bor nu i lib/atlas/runtime.tsx och är
 * persistent på layout-nivå. Den globala flytande pillen är borttagen eftersom
 * AtlasRuntimeProvider i app/(platform)/layout.tsx äger hela livscykeln.
 *
 * Kvar som tom stub för att undvika import-fel i befintlig kod.
 * Kan tas bort helt i P1B-cleanup.
 */

export function VoiceAssistant() {
  return null
}
