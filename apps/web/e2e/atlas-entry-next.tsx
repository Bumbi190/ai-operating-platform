import React from 'react'
export default function Link({ children, href, ...props }: any) { return <a href={href} {...props} onClick={event=>{props.onClick?.(event);if(!event.defaultPrevented && !event.metaKey && !event.ctrlKey && typeof href==='string' && href.startsWith('/')){event.preventDefault();history.pushState(null,'',href);window.dispatchEvent(new PopStateEvent('popstate'))}}}>{children}</a> }
export function Image({ fill, priority, quality, unoptimized, ...props }: any) { return <img {...props} /> }
