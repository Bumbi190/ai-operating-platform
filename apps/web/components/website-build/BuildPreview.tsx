'use client'
import { useEffect, useMemo, useRef } from 'react'
import { renderPreviewDocument } from '@/lib/website-build/preview-runtime'
import type { PreviewRevision, WebsiteArtifact } from '@/lib/website-build/types'
import styles from './BuildWorkspace.module.css'
export function BuildPreview({ artifact, revision, pageKey, onPageChange, mobile = false }: { artifact: WebsiteArtifact; revision: PreviewRevision; pageKey: string; onPageChange: (key: string) => void; mobile?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const token = useMemo(() => crypto.randomUUID(), [revision.id, pageKey])
  const document = useMemo(() => renderPreviewDocument(artifact, pageKey, token), [artifact, pageKey, token])
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const message = event.data
      if (event.source !== frame.current?.contentWindow || !message || message.type !== 'atlas-preview-page' || message.token !== token || message.artifactHash !== revision.sha256 || !artifact.pages.some(page => page.key === message.pageKey)) return
      onPageChange(message.pageKey)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [artifact, revision.sha256, token, onPageChange])
  return <iframe ref={frame} className={mobile ? styles.mobileFrame : styles.frame} title={`Webbpreview version ${revision.number}`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={document} />
}
