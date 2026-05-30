'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { slugify } from '@/lib/utils'
import { OSPage, OSLayer } from '@/components/platform/os'

const PROJECT_COLORS = [
  { value: '#6366f1', label: 'Indigo' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#10b981', label: 'Grön' },
  { value: '#3b82f6', label: 'Blå' },
  { value: '#8b5cf6', label: 'Lila' },
  { value: '#ef4444', label: 'Röd' },
  { value: '#06b6d4', label: 'Cyan' },
]

export default function NewProjectPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slug = slugify(name)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)

    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), color }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Något gick fel')
      setLoading(false)
      return
    }

    // Navigate to new project
    router.push(`/projects/${data.slug}`)
    router.refresh() // Trigger sidebar to reload
  }

  return (
    <OSPage className="animate-fade-in">
      <OSLayer layer="hero">
        <p className="eyebrow eyebrow-accent mb-3">System · deploy new business</p>
        <h1 className="text-3xl 2xl:text-4xl font-bold tracking-tight">Skapa projekt</h1>
        <p className="text-sm 2xl:text-base text-zinc-400 mt-2 max-w-2xl">
          Ett projekt är en isolerad arbetsyta med egna agenter, workflows och utdata
        </p>
      </OSLayer>

      <OSLayer layer="operational">
      <form onSubmit={handleSubmit} className="space-y-6 max-w-xl 3xl:max-w-2xl">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="name">Projektnamn *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="t.ex. Familje-Stunden"
            required
            autoFocus
          />
          {name && (
            <p className="text-xs text-muted-foreground font-mono">
              slug: <span className="text-foreground">{slug}</span>
            </p>
          )}
        </div>

        {/* Color */}
        <div className="space-y-2">
          <Label>Färg</Label>
          <div className="flex gap-2 flex-wrap">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => setColor(c.value)}
                className="w-8 h-8 rounded-full transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                style={{
                  backgroundColor: c.value,
                  outline: color === c.value ? `3px solid ${c.value}` : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>
        </div>

        {/* Preview */}
        {name && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground mb-2">Förhandsvisning</p>
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="font-medium">{name}</span>
              <span className="text-xs text-muted-foreground font-mono ml-1">
                /{slug}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading || !name.trim()}>
            {loading ? 'Skapar...' : 'Skapa projekt'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push('/dashboard')}
          >
            Avbryt
          </Button>
        </div>
      </form>
      </OSLayer>
    </OSPage>
  )
}
