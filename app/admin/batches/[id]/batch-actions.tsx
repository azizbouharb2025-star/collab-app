'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Edit, CheckSquare } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { BatchStatus } from '@/lib/types'

interface BatchActionsProps {
  batchId: string
  status: BatchStatus
}

export function BatchActions({ batchId, status }: BatchActionsProps) {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()
  const [loading, setLoading] = React.useState(false)

  const handleCloseBatch = async () => {
    try {
      setLoading(true)
      const { error } = await supabase
        .from('batches')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', batchId)

      if (error) throw error

      toast({
        title: 'Lot clôturé',
        description: 'Le statut du lot est désormais Clos.',
      })

      router.refresh()
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Impossible de clôturer le lot'
      toast({
        title: 'Erreur',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Link href={`/admin/batches/${batchId}/edit`}>
        <Button variant="outline" size="sm">
          <Edit className="mr-2 h-4 w-4" />
          Modifier le lot
        </Button>
      </Link>

      {status !== 'closed' && (
        <ConfirmDialog
          title="Clôturer définitivement ce lot ?"
          description="Cette action passe le lot en statut Clos. Les saisies ultérieures seront verrouillées."
          confirmLabel="Clôturer le lot"
          cancelLabel="Annuler"
          variant="default"
          loading={loading}
          onConfirm={handleCloseBatch}
          trigger={
            <Button variant="secondary" size="sm">
              <CheckSquare className="mr-2 h-4 w-4" />
              Clôturer le lot
            </Button>
          }
        />
      )}
    </div>
  )
}
