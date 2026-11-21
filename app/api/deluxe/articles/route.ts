import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDeluxeDir, readDeluxeArticles, readDeluxeSocietes } from '@/lib/deluxe/dbf-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/deluxe/articles
 * Retourne les articles et sociétés lus depuis C:\Deluxe\Gestcom\TUNISIESANITAIRES2018
 */
export async function GET() {
  try {
    const deluxeDir = getDeluxeDir()
    const articles = readDeluxeArticles(deluxeDir)
    const societes = readDeluxeSocietes(deluxeDir)

    return NextResponse.json({
      success: true,
      deluxeDir,
      count: articles.length,
      articles,
      societes,
    })
  } catch (err: unknown) {
    console.error('Erreur lecture Article.DBF:', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Impossible de lire Article.DBF dans le dossier Deluxe.',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/deluxe/articles
 * Synchronise/importe les articles de Article.DBF dans la table `models` de Supabase
 * (name = REF Deluxe, description = NOM Deluxe)
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const deluxeDir = getDeluxeDir()
    const articles = readDeluxeArticles(deluxeDir).filter((a) => !a.suspendre)

    // Charger les modèles existants dans Supabase
    const { data: existingModels, error: fetchErr } = await supabase
      .from('models')
      .select('id, name, description')

    if (fetchErr) throw fetchErr

    const existingByName = new Map<string, { id: string; name: string; description: string | null }>()
    ;(existingModels || []).forEach((m) => {
      existingByName.set(m.name.trim().toUpperCase(), m)
    })

    const toInsert: Array<{ name: string; description: string; active: boolean }> = []
    let updatedCount = 0

    for (const art of articles) {
      const refUpper = art.ref.trim().toUpperCase()
      const desc = `${art.nom} (Prix: ${art.prixHt.toFixed(3)} TND | Unité: ${art.unite})`

      const existing = existingByName.get(refUpper)
      if (!existing) {
        toInsert.push({
          name: refUpper,
          description: desc,
          active: true,
        })
        existingByName.set(refUpper, { id: '', name: refUpper, description: desc })
      } else if (!existing.description) {
        await supabase.from('models').update({ description: desc }).eq('id', existing.id)
        updatedCount++
      }
    }

    // Insertion par paquets de 100 pour éviter toute limite
    let insertedCount = 0
    const chunkSize = 100
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize)
      const { error: insErr } = await supabase.from('models').insert(chunk)
      if (insErr) throw insErr
      insertedCount += chunk.length
    }

    return NextResponse.json({
      success: true,
      totalInDbf: articles.length,
      insertedCount,
      updatedCount,
    })
  } catch (err: unknown) {
    console.error('Erreur import articles Deluxe:', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erreur lors de l'importation des articles depuis Article.DBF",
      },
      { status: 500 }
    )
  }
}
