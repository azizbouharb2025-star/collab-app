import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { State } from '@/lib/types'
import { cn } from '@/lib/utils'

interface StateBadgeProps {
  state: Pick<State, 'name' | 'color'>
  className?: string
}

export function StateBadge({ state, className }: StateBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('text-white border-transparent font-medium shadow-none select-none', className)}
      style={{ backgroundColor: state.color }}
    >
      {state.name}
    </Badge>
  )
}
