import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { BatchStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

interface BatchStatusBadgeProps {
  status: BatchStatus
  className?: string
}

const statusConfig: Record<
  BatchStatus,
  { label: string; className: string }
> = {
  draft: {
    label: 'Brouillon',
    className:
      'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
  sent: {
    label: 'Envoyé',
    className:
      'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  },
  open: {
    label: 'En cours',
    className:
      'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  },
  completed: {
    label: 'Terminé',
    className:
      'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  },
  closed: {
    label: 'Clôturé',
    className:
      'bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
  },
}

export function BatchStatusBadge({ status, className }: BatchStatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    className: 'bg-muted text-muted-foreground border-transparent',
  }

  return (
    <Badge
      variant="outline"
      className={cn('font-medium shadow-none select-none', config.className, className)}
    >
      {config.label}
    </Badge>
  )
}
