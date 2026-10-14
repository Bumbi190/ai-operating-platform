import React from 'react'
export default function Link({ children, href, ...props }: any) { return <a href={href} {...props}>{children}</a> }
export function Image({ fill, priority, quality, unoptimized, ...props }: any) { return <img {...props} /> }
