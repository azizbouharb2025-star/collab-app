'use client'

import * as React from 'react'
import { Timer, Pause, Play, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface StopwatchProps {
  startTime: string | null
  className?: string
  showIcon?: boolean
  allowControls?: boolean
  isPaused?: boolean
  onTogglePause?: () => void
  elapsedSeconds?: number
}

export function Stopwatch({
  startTime,
  className,
  showIcon = true,
  allowControls = false,
  isPaused = false,
  onTogglePause,
  elapsedSeconds: controlledElapsedSeconds,
}: StopwatchProps) {
  const [internalElapsedSeconds, setInternalElapsedSeconds] = React.useState<number>(0)

  React.useEffect(() => {
    if (controlledElapsedSeconds !== undefined) {
      setInternalElapsedSeconds(controlledElapsedSeconds)
      return
    }

    if (!startTime) {
      setInternalElapsedSeconds(0)
      return
    }

    const startTimestamp = new Date(startTime).getTime()
    if (isNaN(startTimestamp)) {
      setInternalElapsedSeconds(0)
      return
    }

    if (isPaused) return

    const updateTimer = () => {
      const now = Date.now()
      const totalSeconds = Math.max(0, Math.floor((now - startTimestamp) / 1000))
      setInternalElapsedSeconds(totalSeconds)
    }

    updateTimer()
    const intervalId = setInterval(updateTimer, 1000)

    return () => clearInterval(intervalId)
  }, [startTime, isPaused, controlledElapsedSeconds])

  const totalSeconds = controlledElapsedSeconds !== undefined ? controlledElapsedSeconds : internalElapsedSeconds
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (n: number) => n.toString().padStart(2, '0')
  const formattedTime = startTime || controlledElapsedSeconds !== undefined
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : '--:--:--'

  return (
    <div className={cn('inline-flex items-center gap-2 font-mono text-sm', className)}>
      {showIcon && <Timer className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className={cn('tabular-nums font-bold tracking-wider', isPaused && 'opacity-60')}>
        {formattedTime}
      </span>

      {allowControls && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onTogglePause}
          className="h-7 px-2 text-xs gap-1 ml-1"
        >
          {isPaused ? (
            <>
              <Play className="h-3.5 w-3.5 text-emerald-600 fill-emerald-600" />
              <span>Reprendre</span>
            </>
          ) : (
            <>
              <Pause className="h-3.5 w-3.5 text-amber-600 fill-amber-600" />
              <span>Pause</span>
            </>
          )}
        </Button>
      )}
    </div>
  )
}
