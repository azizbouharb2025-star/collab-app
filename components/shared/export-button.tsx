'use client'

import * as React from 'react'
import { Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Button, ButtonProps } from '@/components/ui/button'

interface ExportButtonProps extends Omit<ButtonProps, 'onClick'> {
  data: Record<string, unknown>[]
  filename: string
  label?: string
  format?: 'csv' | 'xlsx'
}

export function ExportButton({
  data,
  filename,
  label = 'Exporter (CSV)',
  format = 'csv',
  variant = 'outline',
  size = 'sm',
  className,
  disabled,
  ...props
}: ExportButtonProps) {
  const [isExporting, setIsExporting] = React.useState(false)

  const handleExport = () => {
    if (!data || data.length === 0) return

    try {
      setIsExporting(true)
      const worksheet = XLSX.utils.json_to_sheet(data)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Export')

      const extension = format === 'csv' ? '.csv' : '.xlsx'
      const finalFilename = filename.toLowerCase().endsWith(extension)
        ? filename
        : `${filename}${extension}`

      XLSX.writeFile(workbook, finalFilename, {
        bookType: format === 'csv' ? 'csv' : 'xlsx',
      })
    } catch (error) {
      console.error("Erreur lors de l'export :", error)
    } finally {
      setIsExporting(false)
    }
  }

  const isDisabled = disabled || isExporting || !data || data.length === 0

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleExport}
      disabled={isDisabled}
      className={className}
      {...props}
    >
      <Download className="mr-2 h-4 w-4" />
      {label}
    </Button>
  )
}
