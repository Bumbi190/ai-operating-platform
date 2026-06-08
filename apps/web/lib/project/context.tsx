'use client'

import { createContext, useContext, type ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
//  ProjectContext
//  ─────────────────────────────────────────────────────────────────────────────
//  Provides the active project's identity to client components rendered under
//  `/projects/[slug]/*`. Server components should resolve the project directly
//  via `getProjectBySlug` (request-cached); this context exists so client-side
//  children (buttons, widgets) can read project identity without prop-drilling.
// ─────────────────────────────────────────────────────────────────────────────

export type ProjectContextValue = {
  projectId: string
  projectSlug: string
  projectName: string
  projectColor: string
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({
  value,
  children,
}: {
  value: ProjectContextValue
  children: ReactNode
}) {
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

/**
 * Read the active project. Throws if used outside `/projects/[slug]/*`, which
 * surfaces accidental usage on global/Atlas surfaces during development.
 */
export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) {
    throw new Error('useProject must be used within a ProjectProvider (a /projects/[slug] route)')
  }
  return ctx
}

/** Non-throwing variant for components that may render in either context. */
export function useProjectOptional(): ProjectContextValue | null {
  return useContext(ProjectContext)
}
