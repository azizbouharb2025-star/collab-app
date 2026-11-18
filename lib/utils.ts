import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatage monétaire en Dinars Tunisiens (TND)
 */
export function formatCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat('fr-TN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount || 0)

  return `${formatted} TND`
}

/**
 * Génère le nom d'affichage d'un lot :
 * "Lot du [date saisie] - [note optionnelle]"
 */
export function getBatchDisplayName(batch: {
  created_at?: string
  sent_at?: string | null
  note?: string | null
  id?: string
}): string {
  const dateToUse = batch.sent_at || batch.created_at || new Date().toISOString()
  let dateFormatted = ''
  try {
    dateFormatted = format(new Date(dateToUse), 'dd/MM/yyyy', { locale: fr })
  } catch {
    dateFormatted = dateToUse.slice(0, 10)
  }

  const base = `Lot du ${dateFormatted}`
  if (batch.note && batch.note.trim()) {
    // Si la note est longue, tronquer pour l'affichage de titre
    const noteText = batch.note.trim()
    return `${base} (${noteText})`
  }

  return base
}
