'use client'

import * as React from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface QuantitySelectorProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  label?: string
  disabled?: boolean
  className?: string
}

export function QuantitySelector({
  value,
  onChange,
  min = 0,
  max,
  label,
  disabled = false,
  className,
}: QuantitySelectorProps) {
  const handleDecrement = () => {
    if (disabled) return
    if (min !== undefined && value <= min) return
    onChange(value - 1)
  }

  const handleIncrement = () => {
    if (disabled) return
    if (max !== undefined && value >= max) return
    onChange(value + 1)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value
    if (rawVal === '') {
      onChange(min)
      return
    }
    const num = parseInt(rawVal, 10)
    if (isNaN(num)) return

    let clamped = num
    if (min !== undefined && clamped < min) clamped = min
    if (max !== undefined && clamped > max) clamped = max
    onChange(clamped)
  }

  const isMinDisabled = disabled || (min !== undefined && value <= min)
  const isMaxDisabled = disabled || (max !== undefined && value >= max)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleDecrement}
          disabled={isMinDisabled}
          className="min-h-12 min-w-12 h-12 w-12 text-lg active:scale-95 transition-transform"
          aria-label="Diminuer la quantité"
        >
          <Minus className="h-6 w-6" />
        </Button>

        <Input
          type="number"
          value={isNaN(value) ? '' : value}
          onChange={handleInputChange}
          min={min}
          max={max}
          disabled={disabled}
          className="h-12 text-center text-lg font-semibold w-24 sm:w-28 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleIncrement}
          disabled={isMaxDisabled}
          className="min-h-12 min-w-12 h-12 w-12 text-lg active:scale-95 transition-transform"
          aria-label="Augmenter la quantité"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
    </div>
  )
}
