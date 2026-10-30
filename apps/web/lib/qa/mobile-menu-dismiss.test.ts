import { describe, expect, it, vi } from 'vitest'
import { closeMobileMenuOnNavigation } from '@/components/platform/vnext/MobileMenuLink'

describe('vNext mobile menu dismissal', () => {
  it('closes the native details immediately when any menu link is chosen', () => {
    const removeAttribute = vi.fn()
    const closest = vi.fn((selector: string) =>
      selector === 'details' ? { removeAttribute } : null,
    )
    closeMobileMenuOnNavigation({ closest } as unknown as HTMLAnchorElement)
    expect(closest).toHaveBeenCalledTimes(1)
    expect(closest).toHaveBeenCalledWith('details')
    expect(removeAttribute).toHaveBeenCalledTimes(1)
    expect(removeAttribute).toHaveBeenCalledWith('open')
  })

  it('does not affect anything if the link is no longer inside the menu', () => {
    const closest = vi.fn(() => null)
    expect(() =>
      closeMobileMenuOnNavigation({ closest } as unknown as HTMLAnchorElement),
    ).not.toThrow()
    expect(closest).toHaveBeenCalledWith('details')
  })
})
