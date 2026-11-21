import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createDeluxeBei, CreateBeiLineInput } from '@/lib/deluxe/dbf-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/deluxe/bei
 * Crée directement un BEI dans C:\Deluxe\Gestcom\TUNISIESANITAIRES2018\bei26.DBF & bei_op26.DBF
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const body = await request.json()
    const {
      societeCode,
      societeNom,
      depot = 1,
      dateOp,
      lines,
    }: {
      societeCode?: string
      societeNom?: string
      depot?: number
      dateOp?: string
      lines: CreateBeiLineInput[]
    } = body

    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: 'Aucune ligne de livraison sélectionnée pour le BEI.' },
        { status: 400 }
      )
    }

    const parsedDate = dateOp ? new Date(dateOp) : new Date()

    const result = createDeluxeBei({
      dateOp: isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
      depot: Number(depot) || 1,
      societeCode: societeCode?.trim() || '',
      societeNom: societeNom?.trim() || '',
      lines,
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (err: unknown) {
    console.error('Erreur création BEI Deluxe:', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Erreur lors de la création du BEI dans Deluxe Gestcom.',
      },
      { status: 500 }
    )
  }
}
