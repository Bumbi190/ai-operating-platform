import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Atlas Home shares the same markdown semantics as the dedicated /chat view.
 * This renderer is presentation only: it never interprets HTML or issues
 * tool calls. Outbound links need explicit safe URL schemes.
 */
const components: Components = {
  a({ href, children }) {
    if (
      !href ||
      !(href.startsWith('https://') || href.startsWith('#') ||
        (href.startsWith('/') && !href.startsWith('//')))
    ) {
      return <span>{children}</span>
    }

    const external = href.startsWith('https://')
    const label =
      typeof children === 'string' && children === href && href.length > 85
        ? 'Öppna källan'
        : children

    return (
      <a
        href={href}
        rel={external ? 'noopener noreferrer' : undefined}
        target={external ? '_blank' : undefined}
        title={label === 'Öppna källan' ? href : undefined}
      >
        {label}
      </a>
    )
  },
}

export function AtlasResponseMarkdown({
  text,
  className,
}: {
  text: string
  className: string
}) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
