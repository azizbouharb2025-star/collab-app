import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  title: string
  value: string | number
  variation?: string
  description?: string
  icon?: React.ReactNode
  className?: string
}

export function KpiCard({
  title,
  value,
  variation,
  description,
  icon,
  className,
}: KpiCardProps) {
  return (
    <Card className={cn('shadow-sm overflow-hidden', className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {icon && (
            <div className="text-muted-foreground p-2 rounded-md bg-muted/50">
              {icon}
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <div className="text-2xl font-bold tracking-tight">{value}</div>
          {(variation || description) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {variation && (
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {variation}
                </span>
              )}
              {description && <span>{description}</span>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
