import React from 'react'
import { Composition } from 'remotion'
import { ShortFormVideo } from './compositions/ShortFormVideo'
import { SimpleNewsReel } from './compositions/SimpleNewsReel'
import { ContentGrowthReel } from './compositions/ContentGrowthReel'
import { FamilyNovemberTeaser } from './compositions/FamilyNovemberTeaser'
import type { VideoInputProps } from './lib/types'

// Default props for Remotion Studio preview
const defaultProps: VideoInputProps = {
  hook: "This AI just changed everything.",
  script: "Anthropic just released Claude 4 — and it can reason like a senior engineer.",
  caption: "AI updates weekly 🤖",
  audioUrl: "https://example.com/audio.mp3",  // replace with real URL in Studio
  durationMs: 45000,
  words: [],
  accentColor: '#6366f1',
  theme: 'dark',
}

export function RemotionRoot() {
  return (
    <>
      {/* Full cinematic version — 5 scenes, Ken Burns, scene transitions */}
      <Composition
        id="ShortFormVideo"
        component={ShortFormVideo}
        durationInFrames={Math.ceil((defaultProps.durationMs / 1000) * 30)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
        calculateMetadata={async ({ props }) => {
          const durationInFrames = Math.ceil((props.durationMs / 1000) * 30) + 30
          return { durationInFrames, props }
        }}
      />

      {/* Family-owned November 2026 teaser ? offline visual preview ONLY.
          Requires the matching approved assets staged locally (not committed). */}
      <Composition
        id="FamiljeStundenNovemberTeaser"
        component={FamilyNovemberTeaser}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          heroImagePath: 'content-studio-local/family-november/hero.png' as const,
          activityImagePath: 'content-studio-local/family-november/activity.png' as const,
          musicPath: 'content-studio-local/family-november/music-bed.wav' as const,
        }}
      />

      {/* Creative lab only: isolated previews, never connected to publishing. */}
      <Composition
        id="FamiljeStundenContentLab"
        component={ContentGrowthReel}
        durationInFrames={360}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ brand: 'familje-stunden' as const, imageUrls: [] }}
      />
      <Composition
        id="ThePromptContentLab"
        component={ContentGrowthReel}
        durationInFrames={360}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ brand: 'the-prompt' as const, imageUrls: [] }}
      />

      {/* Lite version — single static image, same audio + captions. ~5× cheaper. */}
      <Composition
        id="SimpleNewsReel"
        component={SimpleNewsReel}
        durationInFrames={Math.ceil((defaultProps.durationMs / 1000) * 30)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
        calculateMetadata={async ({ props }) => {
          const durationInFrames = Math.ceil((props.durationMs / 1000) * 30) + 30
          return { durationInFrames, props }
        }}
      />
    </>
  )
}
