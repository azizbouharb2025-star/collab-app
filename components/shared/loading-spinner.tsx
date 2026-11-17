import * as React from 'react'
import { cn } from '@/lib/utils'

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg'
  text?: string
}

export function LoadingSpinner({
  size = 'md',
  text,
  className,
  ...props
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4',
  }

  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2', className)}
      role="status"
      aria-live="polite"
      {...props}
    >
      <div
        className={cn(
          'animate-spin rounded-full border-primary border-t-transparent',
          sizeClasses[size]
        )}
      />
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
      <span className="sr-only">Chargement...</span>
    </div>
  )
}
