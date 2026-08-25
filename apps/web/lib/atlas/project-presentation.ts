export interface ProjectPresentation {
  shortLabel: string
  heroImage?: string
  heroPosition?: string
}

/**
 * Optional presentation only. Project identity and authorization always come
 * from the server-built AtlasHomeViewModel.
 */
const PROJECT_PRESENTATION: Readonly<Record<string, ProjectPresentation>> = {
  'ai-media-automation': {
    shortLabel: 'The Prompt',
    heroImage: '/project-rail/the-prompt.jpg',
    heroPosition: '50% 48%',
  },
  'familje-stunden': {
    shortLabel: 'Familje-Stunden',
    heroImage: '/project-rail/familje-stunden.png',
    heroPosition: '50% 48%',
  },
  gainpilot: {
    shortLabel: 'GainPilot',
    heroImage: '/project-rail/gainpilot.png',
    heroPosition: '50% 42%',
  },
  studieos: {
    shortLabel: 'StudieOS',
    heroImage: '/project-rail/studieos.png',
    heroPosition: '50% 50%',
  },
  'studie-os': {
    shortLabel: 'StudieOS',
    heroImage: '/project-rail/studieos.png',
    heroPosition: '50% 50%',
  },
}

export function presentationForProject(slug: string, name: string): ProjectPresentation {
  return PROJECT_PRESENTATION[slug] ?? { shortLabel: name }
}
