import type { MouseEvent } from 'react'
import { useRouter } from './atlas-overview-messenger-navigation'
export default function Link({
  href,
  children,
  onClick,
  target,
  prefetch,
  replace,
  scroll,
  ...props
}: any) {
  const router = useRouter()
  return (
    <a
      {...props}
      href={href}
      target={target}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e)
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          target === '_blank' ||
          typeof href !== 'string' ||
          !href.startsWith('/') ||
          href.startsWith('//')
        )
          return
        e.preventDefault()
        if (replace) router.replace(href)
        else router.push(href)
      }}
    >
      {children}
    </a>
  )
}
