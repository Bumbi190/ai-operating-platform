'use client'

import { useState, useOptimistic, useTransition } from 'react'
import { Plus, X, GripVertical, CheckCircle2, Circle, Clock, Lightbulb, Bug, Target } from 'lucide-react'
import { cn } from '@/lib/utils'

type ItemType = 'task' | 'goal' | 'improvement' | 'bug' | 'idea'
type ItemStatus = 'backlog' | 'todo' | 'in_progress' | 'done'
type ItemPriority = 'low' | 'medium' | 'high'

interface PlanningItem {
  id: string
  title: string
  type: ItemType
  status: ItemStatus
  priority: ItemPriority
  description?: string
}

const COLUMNS: { id: ItemStatus; label: string; color: string }[] = [
  { id: 'backlog', label: 'Backlog',   color: 'text-muted-foreground' },
  { id: 'todo',    label: 'Att göra', color: 'text-blue-400' },
  { id: 'in_progress', label: 'Pågår', color: 'text-amber-400' },
  { id: 'done',    label: 'Klart',    color: 'text-green-400' },
]

const TYPE_CONFIG: Record<ItemType, { label: string; icon: React.ElementType; color: string }> = {
  task:        { label: 'Uppgift',     icon: Circle,       color: 'text-blue-400 bg-blue-400/10' },
  goal:        { label: 'Mål',         icon: Target,       color: 'text-purple-400 bg-purple-400/10' },
  improvement: { label: 'Förbättring', icon: Lightbulb,    color: 'text-amber-400 bg-amber-400/10' },
  bug:         { label: 'Bugg',        icon: Bug,          color: 'text-red-400 bg-red-400/10' },
  idea:        { label: 'Idé',         icon: Lightbulb,    color: 'text-teal-400 bg-teal-400/10' },
}

const PRIORITY_COLOR: Record<ItemPriority, string> = {
  low:    'text-muted-foreground/60',
  medium: 'text-amber-400/70',
  high:   'text-red-400',
}

const SAMPLE_ITEMS: PlanningItem[] = [
  { id: '1', title: 'Bygg PlanningBoard UI', type: 'task', status: 'done', priority: 'high' },
  { id: '2', title: 'Lägg till Kostnader i sidebar', type: 'task', status: 'done', priority: 'high' },
  { id: '3', title: 'Manager-agent: godkännandeflöde', type: 'goal', status: 'todo', priority: 'high' },
  { id: '4', title: 'Approval UI i plattformen', type: 'task', status: 'backlog', priority: 'medium' },
  { id: '5', title: 'Köra DB-migration via Supabase', type: 'task', status: 'todo', priority: 'high' },
  { id: '6', title: 'Schemaläggning: cron per workflow', type: 'improvement', status: 'backlog', priority: 'medium' },
  { id: '7', title: 'DALL-E 3 — fixa OpenAI-behörighet', type: 'bug', status: 'in_progress', priority: 'high' },
  { id: '8', title: 'Notifieringar vid körning klar', type: 'idea', status: 'backlog', priority: 'low' },
]

let nextId = 100

export function PlanningBoard() {
  const [items, setItems] = useState<PlanningItem[]>(SAMPLE_ITEMS)
  const [addingIn, setAddingIn] = useState<ItemStatus | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState<ItemType>('task')
  const [newPriority, setNewPriority] = useState<ItemPriority>('medium')

  function addItem(status: ItemStatus) {
    const title = newTitle.trim()
    if (!title) return
    const item: PlanningItem = {
      id: String(++nextId),
      title,
      type: newType,
      status,
      priority: newPriority,
    }
    setItems((prev) => [...prev, item])
    setNewTitle('')
    setNewType('task')
    setNewPriority('medium')
    setAddingIn(null)
  }

  function moveItem(id: string, newStatus: ItemStatus) {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, status: newStatus } : it))
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData('itemId', id)
  }

  function handleDrop(e: React.DragEvent, status: ItemStatus) {
    e.preventDefault()
    const id = e.dataTransfer.getData('itemId')
    if (id) moveItem(id, status)
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold">Sprint-board</h2>
        <span className="text-xs text-muted-foreground">— dra kort mellan kolumner</span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {COLUMNS.map((col) => {
          const colItems = items.filter((it) => it.status === col.id)
          const isAdding = addingIn === col.id

          return (
            <div
              key={col.id}
              className="flex flex-col min-h-48 rounded-xl border border-border bg-card/50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                <span className={cn('text-xs font-semibold', col.color)}>{col.label}</span>
                <span className="text-xs text-muted-foreground/50 tabular-nums">{colItems.length}</span>
              </div>

              {/* Cards */}
              <div className="flex-1 p-2 space-y-1.5">
                {colItems.map((item) => (
                  <Card
                    key={item.id}
                    item={item}
                    onMove={moveItem}
                    onRemove={removeItem}
                    onDragStart={handleDragStart}
                  />
                ))}
              </div>

              {/* Add card */}
              <div className="p-2 border-t border-border/50">
                {isAdding ? (
                  <div className="space-y-1.5">
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addItem(col.id)
                        if (e.key === 'Escape') { setAddingIn(null); setNewTitle('') }
                      }}
                      placeholder="Titel..."
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="flex gap-1">
                      <select
                        value={newType}
                        onChange={(e) => setNewType(e.target.value as ItemType)}
                        className="flex-1 rounded border border-border bg-background px-1 py-0.5 text-[10px] text-muted-foreground focus:outline-none"
                      >
                        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                          <option key={key} value={key}>{cfg.label}</option>
                        ))}
                      </select>
                      <select
                        value={newPriority}
                        onChange={(e) => setNewPriority(e.target.value as ItemPriority)}
                        className="flex-1 rounded border border-border bg-background px-1 py-0.5 text-[10px] text-muted-foreground focus:outline-none"
                      >
                        <option value="low">Låg</option>
                        <option value="medium">Medel</option>
                        <option value="high">Hög</option>
                      </select>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => addItem(col.id)}
                        className="flex-1 rounded bg-indigo-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-600 transition-colors"
                      >
                        Lägg till
                      </button>
                      <button
                        onClick={() => { setAddingIn(null); setNewTitle('') }}
                        className="px-2 py-0.5 rounded border border-border text-[10px] text-muted-foreground hover:bg-muted transition-colors"
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingIn(col.id)}
                    className="flex items-center gap-1 w-full px-1.5 py-1 rounded text-xs text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Lägg till kort
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Card({
  item,
  onMove,
  onRemove,
  onDragStart,
}: {
  item: PlanningItem
  onMove: (id: string, status: ItemStatus) => void
  onRemove: (id: string) => void
  onDragStart: (e: React.DragEvent, id: string) => void
}) {
  const typeCfg = TYPE_CONFIG[item.type]
  const Icon = typeCfg.icon
  const isDone = item.status === 'done'

  const otherStatuses = COLUMNS.filter((c) => c.id !== item.status)

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item.id)}
      className="group relative rounded-lg border border-border bg-card p-2.5 cursor-grab active:cursor-grabbing hover:border-border/80 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-3 h-3 text-muted-foreground/30 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className={cn('text-xs leading-snug', isDone && 'line-through text-muted-foreground/50')}>
            {item.title}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className={cn('inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded', typeCfg.color)}>
              <Icon className="w-2.5 h-2.5" />
              {typeCfg.label}
            </span>
            <span className={cn('text-[10px]', PRIORITY_COLOR[item.priority])}>
              {item.priority === 'high' ? '↑ Hög' : item.priority === 'low' ? '↓ Låg' : ''}
            </span>
          </div>
        </div>
        <button
          onClick={() => onRemove(item.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted text-muted-foreground/40 hover:text-muted-foreground shrink-0"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Quick-move dropdown */}
      <div className="mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 flex-wrap">
        {otherStatuses.map((s) => (
          <button
            key={s.id}
            onClick={() => onMove(item.id, s.id)}
            className={cn('text-[9px] px-1.5 py-0.5 rounded border border-border hover:bg-muted transition-colors', s.color)}
          >
            → {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
