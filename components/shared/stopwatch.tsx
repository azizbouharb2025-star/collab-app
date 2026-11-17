'use client'

import * as React from 'react'
import { Timer } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StopwatchProps {
  startTime: string | null
  className?: string
  showIcon?: boolean
}

export function Stopwatch({
  startTime,
  className,
  showIcon = true,
}: StopwatchProps) {
  const [elapsed, setElapsed] = React.useState<string>('--:--:--')

  React.useEffect(() => {
    if (!startTime) {
      setElapsed('--:--:--')
      return
    }

    const startTimestamp = new Date(startTime).getTime()
    if (isNaN(startTimestamp)) {
      setElapsed('--:--:--')
      return
    }

    const updateTimer = () => {
      const now = Date.now()
      const totalSeconds = Math.max(0, Math.floor((now - startTimestamp) / 1000))

      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60

      const pad = (n: number) => n.toString().padStart(2, '0')
      setElapsed(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`)
    }

    updateTimer()
    const intervalId = setInterval(updateTimer, 1000)

    return () => clearInterval(intervalId)
  }, [startTime])

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-sm tracking-wider font-semibold',
        className
      )}
    >
      {showIcon && <Timer className="h-4 w-4 text-muted-foreground animate-pulse" />}
      <span>{elapsed}</span>
    </div>
  )
}
