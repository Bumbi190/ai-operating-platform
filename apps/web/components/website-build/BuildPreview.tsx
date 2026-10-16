'use client'
import { useEffect, useMemo, useRef } from 'react'
import { renderPreviewDocument } from '@/lib/website-build/preview-runtime'
import type { PreviewRevision, WebsiteArtifact } from '@/lib/website-build/types'
import styles from './BuildWorkspace.module.css'
export function BuildPreview({ artifact, revision, pageKey, onPageChange, mobile = false,onRenderedRevision,onExitFullscreen }: { artifact: WebsiteArtifact; revision: PreviewRevision; pageKey: string; onPageChange: (key: string) => void; mobile?: boolean;onRenderedRevision?:(id:string)=>void;onExitFullscreen?:()=>void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const renderedToken=useRef<string|null>(null)
  const token = useMemo(() => crypto.randomUUID(), [revision.id, pageKey])
  const document = useMemo(() => renderPreviewDocument(artifact, pageKey, token), [artifact, pageKey, token])
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const message = event.data
      if (event.source !== frame.current?.contentWindow || !message || !['atlas-preview-page','atlas-preview-ready','atlas-preview-exit-fullscreen'].includes(message.type) || message.token !== token || message.artifactHash !== revision.sha256 || !artifact.pages.some(page => page.key === message.pageKey)) return
      if(message.type==='atlas-preview-ready'){if(renderedToken.current!==token){renderedToken.current=token;onRenderedRevision?.(revision.id)}return}
      if(message.type==='atlas-preview-exit-fullscreen'){onExitFullscreen?.();return}
      onPageChange(message.pageKey)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [artifact, revision.sha256, token, onPageChange,onRenderedRevision,revision.id,onExitFullscreen])
  return <iframe ref={frame} className={mobile ? styles.mobileFrame : styles.frame} title={`Webbpreview version ${revision.number}`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={document} onLoad={()=>frame.current?.contentWindow?.postMessage({type:'atlas-preview-ping',token,artifactHash:revision.sha256},'*')} />
}