'use client'

import { useState } from 'react'
import { useFilterPresets, type IncidentFilter } from '@/lib/filter-presets'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Bookmark, Plus, Pin, PinOff, Trash2, Save, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type Props = {
  currentFilters: IncidentFilter
  onApply: (filters: IncidentFilter) => void
  activePresetId?: string | null
  onActiveChange?: (id: string | null) => void
}

/**
 * Horizontal bar of saved filter preset "chips" + a "Save current" button.
 * Operators click a chip to apply that preset, or save the current filter
 * combination as a new preset.
 */
export function FilterPresetsBar({ currentFilters, onApply, activePresetId, onActiveChange }: Props) {
  const { presets, addPreset, removePreset, togglePin } = useFilterPresets()
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // Sort: pinned first, then by name
  const sorted = [...presets].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return a.name.localeCompare(b.name)
  })

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Preset name is required.')
      return
    }
    if (useFilterPresets.getState().hasPreset(name)) {
      toast.error(`A preset named "${name}" already exists.`)
      return
    }
    const id = addPreset(name.trim(), description.trim(), currentFilters)
    toast.success(`Preset "${name}" saved.`)
    setSaveOpen(false)
    setName('')
    setDescription('')
    onActiveChange?.(id)
  }

  const handleApply = (preset: typeof presets[0]) => {
    onApply(preset.filters)
    onActiveChange?.(preset.id)
  }

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    removePreset(id)
    toast.success(`Preset "${name}" deleted.`)
    if (activePresetId === id) onActiveChange?.(null)
  }

  const handlePin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    togglePin(id)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Bookmark className="mr-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

      {sorted.map((preset) => {
        const active = activePresetId === preset.id
        return (
          <div
            key={preset.id}
            className={cn(
              'group inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground/80 hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <button
              onClick={() => handleApply(preset)}
              className="flex items-center gap-1"
              title={preset.description}
            >
              {preset.pinned && <Pin className="h-3 w-3" />}
              <span>{preset.name}</span>
            </button>
            <button
              onClick={(e) => handlePin(e, preset.id)}
              className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity hover:bg-current/10 group-hover:opacity-60"
              title={preset.pinned ? 'Unpin' : 'Pin'}
            >
              {preset.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
            </button>
            <button
              onClick={(e) => handleDelete(e, preset.id, preset.name)}
              className="rounded p-0.5 opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-60"
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )
      })}

      {/* Save current filters as preset */}
      <Dialog open={saveOpen} onOpenChange={(o) => { setSaveOpen(o); if (!o) { setName(''); setDescription('') } }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
            <Plus className="h-3 w-3" /> Save current
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-4 w-4" /> Save filter preset
            </DialogTitle>
            <DialogDescription>
              Save the current incident queue filters as a named preset for one-click recall.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="preset-name" className="text-xs">Name</Label>
              <Input
                id="preset-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My critical open"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="preset-desc" className="text-xs">Description (optional)</Label>
              <Input
                id="preset-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Critical priority, NEW status"
              />
            </div>
            {/* Current filter summary */}
            <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs">
              <div className="mb-1 font-medium text-muted-foreground">Current filters:</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(currentFilters).filter(([, v]) => v && v !== 'all').length === 0 ? (
                  <span className="text-muted-foreground">No active filters (will save "all")</span>
                ) : (
                  Object.entries(currentFilters)
                    .filter(([, v]) => v && v !== 'all')
                    .map(([k, v]) => (
                      <span key={k} className="rounded bg-info/15 px-1.5 py-0.5 text-[10px] font-medium text-info">
                        {k}: {String(v)}
                      </span>
                    ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name.trim()}>
              <Save className="mr-1 h-3.5 w-3.5" /> Save preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
