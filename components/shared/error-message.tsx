'use client'

import * as React from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface ErrorMessageProps {
  title?: string
  message: string
  onRetry?: () => void
  className?: string
}

export function ErrorMessage({
  title = 'Une erreur est survenue',
  message,
  onRetry,
  className,
}: ErrorMessageProps) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="h-4 w-4" />
      <div className="flex flex-col gap-2 w-full">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="text-sm">{message}</AlertDescription>
        {onRetry && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Réessayer
            </Button>
          </div>
        )}
      </div>
    </Alert>
  )
}
