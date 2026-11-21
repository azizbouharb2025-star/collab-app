import fs from 'fs'
import path from 'path'

export const DEFAULT_DELUXE_DIR = 'C:\\Deluxe\\Gestcom\\TUNISIESANITAIRES2018'

export interface DbfField {
  name: string
  type: string
  length: number
  decimals: number
  offset: number
}

export interface DbfTableMeta {
  numRecords: number
  headerLength: number
  recordLength: number
  fields: DbfField[]
  fieldMap: Record<string, DbfField>
}

export function getDeluxeDir(): string {
  return process.env.DELUXE_DIR || DEFAULT_DELUXE_DIR
}

export function readDbfMeta(buf: Buffer): DbfTableMeta {
  const numRecords = buf.readInt32LE(4)
  const headerLength = buf.readInt16LE(8)
  const recordLength = buf.readInt16LE(10)
  const fields: DbfField[] = []
  const fieldMap: Record<string, DbfField> = {}

  let pos = 32
  let fieldOffset = 1 // byte 0 of record is delete flag (0x20 = active, 0x2A = deleted)

  while (pos < headerLength - 1 && buf[pos] !== 0x0d) {
    let nameEnd = pos
    while (nameEnd < pos + 11 && buf[nameEnd] !== 0) {
      nameEnd++
    }
    const name = buf.toString('ascii', pos, nameEnd).trim()
    const type = String.fromCharCode(buf[pos + 11])
    const length = buf[pos + 16]
    const decimals = buf[pos + 17]

    const field: DbfField = { name, type, length, decimals, offset: fieldOffset }
    fields.push(field)
    fieldMap[name] = field

    fieldOffset += length
    pos += 32
  }

  return { numRecords, headerLength, recordLength, fields, fieldMap }
}

// Décodage latin1/cp1252 basique vers UTF-8
export function decodeWin1252(buf: Buffer, start: number, len: number): string {
  return buf.toString('latin1', start, start + len)
}

export function encodeWin1252(str: string, len: number, padLeft = false): Buffer {
  const clean = (str || '').slice(0, len)
  const padded = padLeft ? clean.padStart(len, ' ') : clean.padEnd(len, ' ')
  return Buffer.from(padded, 'latin1')
}

export interface DeluxeArticle {
  ref: string
  nom: string
  prixAchat: number
  prixHt: number
  unite: string
  suspendre: boolean
}

export interface DeluxeSociete {
  code: string
  nom: string
}

/**
 * Lit tous les articles actifs de Article.DBF
 */
export function readDeluxeArticles(deluxeDir = getDeluxeDir()): DeluxeArticle[] {
  const filePath = path.join(deluxeDir, 'Article.DBF')
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier introuvable : ${filePath}`)
  }

  const buf = fs.readFileSync(filePath)
  const meta = readDbfMeta(buf)
  const articles: DeluxeArticle[] = []

  const fRef = meta.fieldMap['REF']
  const fNom = meta.fieldMap['NOM']
  const fPrixAchat = meta.fieldMap['PRIX_ACHAT']
  const fPrixHt = meta.fieldMap['PRIX_HT']
  const fUnite = meta.fieldMap['UNITE']
  const fSuspendre = meta.fieldMap['SUSPENDRE']

  for (let i = 0; i < meta.numRecords; i++) {
    const recStart = meta.headerLength + i * meta.recordLength
    if (recStart + meta.recordLength > buf.length) break
    const delFlag = buf[recStart]
    if (delFlag === 0x2a) continue // enregistrement supprimé '*'

    const ref = fRef ? decodeWin1252(buf, recStart + fRef.offset, fRef.length).trim() : ''
    if (!ref) continue

    const nom = fNom ? decodeWin1252(buf, recStart + fNom.offset, fNom.length).trim() : ref
    const prixAchat = fPrixAchat
      ? parseFloat(decodeWin1252(buf, recStart + fPrixAchat.offset, fPrixAchat.length).trim()) || 0
      : 0
    const prixHt = fPrixHt
      ? parseFloat(decodeWin1252(buf, recStart + fPrixHt.offset, fPrixHt.length).trim()) || 0
      : 0
    const unite = fUnite
      ? decodeWin1252(buf, recStart + fUnite.offset, fUnite.length).trim() || 'PCE'
      : 'PCE'
    const suspendre = fSuspendre
      ? decodeWin1252(buf, recStart + fSuspendre.offset, fSuspendre.length).trim() === 'T'
      : false

    articles.push({ ref, nom, prixAchat, prixHt, unite, suspendre })
  }

  return articles
}

/**
 * Lit les sociétés / sous-traitants depuis societe.DBF
 */
export function readDeluxeSocietes(deluxeDir = getDeluxeDir()): DeluxeSociete[] {
  const filePath = path.join(deluxeDir, 'societe.DBF')
  if (!fs.existsSync(filePath)) return []

  const buf = fs.readFileSync(filePath)
  const meta = readDbfMeta(buf)
  const list: DeluxeSociete[] = []

  const fCode = meta.fieldMap['CODE']
  const fNom = meta.fieldMap['NOM']

  for (let i = 0; i < meta.numRecords; i++) {
    const recStart = meta.headerLength + i * meta.recordLength
    if (recStart + meta.recordLength > buf.length) break
    if (buf[recStart] === 0x2a) continue

    const code = fCode ? decodeWin1252(buf, recStart + fCode.offset, fCode.length).trim() : ''
    const nom = fNom ? decodeWin1252(buf, recStart + fNom.offset, fNom.length).trim() : ''
    if (code && nom) {
      list.push({ code, nom })
    }
  }

  return list
}

/**
 * Convertit une Date JS en Timestamp Visual FoxPro (8 octets : Julian Day Int32LE + Milliseconds Int32LE)
 */
function dateToVfpDateTime(date: Date): Buffer {
  const b = Buffer.alloc(8)
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  const a = Math.floor((14 - m) / 12)
  const y2 = y + 4800 - a
  const m2 = m + 12 * a - 3
  const jdn =
    d +
    Math.floor((153 * m2 + 2) / 5) +
    365 * y2 +
    Math.floor(y2 / 4) -
    Math.floor(y2 / 100) +
    Math.floor(y2 / 400) -
    32045
  const ms =
    ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 +
    date.getMilliseconds()
  b.writeInt32LE(jdn, 0)
  b.writeInt32LE(ms, 4)
  return b
}

function setField(recBuf: Buffer, meta: DbfTableMeta, fieldName: string, value: string | number | boolean | Buffer) {
  const f = meta.fieldMap[fieldName]
  if (!f) return

  if (Buffer.isBuffer(value)) {
    value.copy(recBuf, f.offset, 0, Math.min(value.length, f.length))
    return
  }

  if (f.type === 'C' || f.type === 'D') {
    const encoded = encodeWin1252(String(value ?? ''), f.length, false)
    encoded.copy(recBuf, f.offset)
  } else if (f.type === 'N' || f.type === 'F') {
    const num = typeof value === 'number' ? value : parseFloat(String(value)) || 0
    const formatted = f.decimals > 0 ? num.toFixed(f.decimals) : Math.round(num).toString()
    const encoded = encodeWin1252(formatted, f.length, true)
    encoded.copy(recBuf, f.offset)
  } else if (f.type === 'I' || f.type === 'M') {
    const intVal = typeof value === 'number' ? Math.round(value) : parseInt(String(value), 10) || 0
    recBuf.writeInt32LE(intVal, f.offset)
  } else if (f.type === 'L') {
    const boolChar = value === true || value === 'T' ? 'T' : 'F'
    recBuf.write(boolChar, f.offset, 1, 'ascii')
  }
}

/**
 * Ajoute une chaîne mémo dans un fichier .FPT Visual FoxPro et retourne le numéro de bloc
 */
function appendFptMemo(fptPath: string, text: string): number {
  const fptBuf = fs.readFileSync(fptPath)
  const nextBlock = fptBuf.readInt32BE(0)
  const blockSize = fptBuf.readUInt16BE(6) || 64

  // Dans Deluxe, ART_NOM est stocké sur 100 caractères dans le mémo
  const strBuf = encodeWin1252(text, 100, false)
  const totalBytes = 8 + strBuf.length
  const blocksNeeded = Math.ceil(totalBytes / blockSize)
  const paddedLen = blocksNeeded * blockSize

  const memoBlock = Buffer.alloc(paddedLen, 0)
  memoBlock.writeInt32BE(1, 0) // Type 1 = Text memo
  memoBlock.writeInt32BE(strBuf.length, 4) // Longueur du texte
  strBuf.copy(memoBlock, 8)

  const targetOffset = nextBlock * blockSize
  const newFileSize = Math.max(fptBuf.length, targetOffset) + paddedLen
  const outBuf = Buffer.alloc(newFileSize, 0)
  fptBuf.copy(outBuf, 0)
  memoBlock.copy(outBuf, targetOffset)

  // Mettre à jour le prochain bloc libre dans l'en-tête FPT (Big Endian bytes 0..3)
  outBuf.writeInt32BE(nextBlock + blocksNeeded, 0)
  fs.writeFileSync(fptPath, outBuf)

  return nextBlock
}

export interface CreateBeiLineInput {
  ref: string
  nom?: string
  quantity: number
  prixAchat?: number
  unite?: string
}

export interface CreateBeiInput {
  dateOp?: Date
  depot?: number
  societeCode?: string
  societeNom?: string
  lines: CreateBeiLineInput[]
}

export interface CreateBeiResult {
  numeroBei: number
  linesCount: number
  totalHt: number
  yearSuffix: string
}

/**
 * Crée directement un BEI dans bei26.DBF + bei_op26.DBF (+ bei_op26.FPT) et met à jour depot_article.DBF
 */
export function createDeluxeBei(input: CreateBeiInput, deluxeDir = getDeluxeDir()): CreateBeiResult {
  if (!input.lines || input.lines.length === 0) {
    throw new Error('Aucune ligne article à envoyer vers BEI Deluxe.')
  }

  const now = input.dateOp || new Date()
  const yearSuffix = String(now.getFullYear()).slice(-2) // "26"
  const beiDbfPath = path.join(deluxeDir, `bei${yearSuffix}.DBF`)
  const beiOpDbfPath = path.join(deluxeDir, `bei_op${yearSuffix}.DBF`)
  const beiOpFptPath = path.join(deluxeDir, `bei_op${yearSuffix}.FPT`)
  const depotArtDbfPath = path.join(deluxeDir, 'depot_article.DBF')

  if (!fs.existsSync(beiDbfPath) || !fs.existsSync(beiOpDbfPath)) {
    throw new Error(`Tables BEI introuvables dans ${deluxeDir} (${beiDbfPath})`)
  }

  // Charger le catalogue articles pour enrichir nom, prix_achat, unité
  const catalog = readDeluxeArticles(deluxeDir)
  const catalogByRef = new Map<string, DeluxeArticle>()
  const catalogByName = new Map<string, DeluxeArticle>()
  catalog.forEach((a) => {
    catalogByRef.set(a.ref.toUpperCase(), a)
    catalogByName.set(a.nom.toUpperCase(), a)
  })

  // 1. Lire bei26.DBF pour trouver le prochain NUMERO et ORDRE
  const beiBuf = fs.readFileSync(beiDbfPath)
  const beiMeta = readDbfMeta(beiBuf)
  const fBeiNum = beiMeta.fieldMap['NUMERO']
  const fBeiOrdre = beiMeta.fieldMap['ORDRE']

  let maxNumero = 0
  let maxOrdre = 0
  for (let i = 0; i < beiMeta.numRecords; i++) {
    const recStart = beiMeta.headerLength + i * beiMeta.recordLength
    if (recStart + beiMeta.recordLength > beiBuf.length) break
    if (beiBuf[recStart] === 0x2a) continue

    const num = fBeiNum
      ? parseInt(decodeWin1252(beiBuf, recStart + fBeiNum.offset, fBeiNum.length).trim(), 10) || 0
      : 0
    const ord = fBeiOrdre
      ? parseInt(decodeWin1252(beiBuf, recStart + fBeiOrdre.offset, fBeiOrdre.length).trim(), 10) || 0
      : 0
    if (num > maxNumero) maxNumero = num
    if (ord > maxOrdre) maxOrdre = ord
  }

  const nextNumero = maxNumero + 1
  const nextOrdre = maxOrdre + 1
  const depotId = input.depot || 1

  // 2. Lire bei_op26.DBF pour trouver le prochain ID de ligne
  const opBuf = fs.readFileSync(beiOpDbfPath)
  const opMeta = readDbfMeta(opBuf)
  const fOpId = opMeta.fieldMap['ID']

  let maxOpId = 0
  for (let i = 0; i < opMeta.numRecords; i++) {
    const recStart = opMeta.headerLength + i * opMeta.recordLength
    if (recStart + opMeta.recordLength > opBuf.length) break
    if (opBuf[recStart] === 0x2a) continue

    const idVal = fOpId
      ? parseInt(decodeWin1252(opBuf, recStart + fOpId.offset, fOpId.length).trim(), 10) || 0
      : 0
    if (idVal > maxOpId) maxOpId = idVal
  }

  // 3. Construire les lignes pour bei_op26.DBF
  const newOpRecords: Buffer[] = []
  let totalHt = 0

  input.lines.forEach((line, idx) => {
    const rawKey = line.ref.trim().toUpperCase()
    const matchedArt = catalogByRef.get(rawKey) || catalogByName.get(rawKey)

    const refCode = matchedArt ? matchedArt.ref : line.ref.trim().slice(0, 20)
    const artNom = matchedArt ? matchedArt.nom : line.nom || refCode
    const prixAchat =
      line.prixAchat !== undefined
        ? line.prixAchat
        : matchedArt
        ? matchedArt.prixAchat > 0
          ? matchedArt.prixAchat
          : matchedArt.prixHt
        : 0
    const unite = matchedArt ? matchedArt.unite : line.unite || 'PCE'
    const qte = Number(line.quantity) || 0
    const lineTotal = prixAchat * qte
    totalHt += lineTotal

    const lineId = maxOpId + idx + 1
    const ordreRef = idx + 1

    // Écrire le nom de l'article dans bei_op26.FPT
    const memoBlock = fs.existsSync(beiOpFptPath) ? appendFptMemo(beiOpFptPath, artNom) : 0

    const rec = Buffer.alloc(opMeta.recordLength, 0x20) // initialiser avec des espaces
    rec[0] = 0x20 // actif

    // Initialiser tous les champs par défaut selon leur type
    opMeta.fields.forEach((f) => {
      if (f.type === 'N' || f.type === 'F') {
        setField(rec, opMeta, f.name, 0)
      } else if (f.type === 'I' || f.type === 'M') {
        setField(rec, opMeta, f.name, 0)
      } else if (f.type === 'L') {
        setField(rec, opMeta, f.name, false)
      }
    })

    setField(rec, opMeta, 'NUMERO', nextNumero)
    setField(rec, opMeta, 'POSTE', 0)
    setField(rec, opMeta, 'NUM_1', 0)
    setField(rec, opMeta, 'PDVPVA_1', 0)
    setField(rec, opMeta, 'DATE_1', '')
    setField(rec, opMeta, 'NUM_BP', 0)
    setField(rec, opMeta, 'DATE_BP', '')
    setField(rec, opMeta, 'ORDRE_REF', ordreRef)
    setField(rec, opMeta, 'REF', refCode)
    setField(rec, opMeta, 'ART_NOM', memoBlock)
    setField(rec, opMeta, 'QTE', qte)
    setField(rec, opMeta, 'REMISE', 0)
    setField(rec, opMeta, 'PRIX_ACHAT', prixAchat)
    setField(rec, opMeta, 'CA2', lineTotal)
    setField(rec, opMeta, 'CA9', lineTotal)
    setField(rec, opMeta, 'CA19', lineTotal)
    setField(rec, opMeta, 'CA30', lineTotal)
    setField(rec, opMeta, 'FODEC', 0)
    setField(rec, opMeta, 'TVA', 0)
    setField(rec, opMeta, 'UNITE', unite)
    setField(rec, opMeta, 'NBR_COLIS', 0)
    setField(rec, opMeta, 'DATE_EXP', '')
    setField(rec, opMeta, 'ID_DEPOT', 0)
    setField(rec, opMeta, 'PDVPVA', 1)
    setField(rec, opMeta, 'INDEXORDER', idx)
    setField(rec, opMeta, 'ID', lineId)
    setField(rec, opMeta, 'STOCK', 0)
    setField(rec, opMeta, 'QTE_CMD', 0)
    setField(rec, opMeta, 'IDKEY', `${lineId}  ${nextNumero}  1`)
    setField(rec, opMeta, 'IDAC', 0)
    setField(rec, opMeta, 'PRIX', true)
    setField(rec, opMeta, 'ID_COLOR', 0)
    setField(rec, opMeta, 'ID_SIZE', 0)
    setField(rec, opMeta, 'QTE2', 0)
    setField(rec, opMeta, 'RATIO_U2', 0)
    setField(rec, opMeta, 'ID_UNITE2', 0)

    newOpRecords.push(rec)
  })

  // 4. Construire l'enregistrement d'en-tête pour bei26.DBF
  const beiRec = Buffer.alloc(beiMeta.recordLength, 0x20)
  beiRec[0] = 0x20

  beiMeta.fields.forEach((f) => {
    if (f.type === 'N' || f.type === 'F') {
      setField(beiRec, beiMeta, f.name, 0)
    } else if (f.type === 'I' || f.type === 'M') {
      setField(beiRec, beiMeta, f.name, 0)
    } else if (f.type === 'L') {
      setField(beiRec, beiMeta, f.name, false)
    }
  })

  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const dateOpStr = `${yyyy}${mm}${dd}`
  const heureStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  setField(beiRec, beiMeta, 'NUMERO', nextNumero)
  setField(beiRec, beiMeta, 'DEPOT', depotId)
  setField(beiRec, beiMeta, 'ORDRE', nextOrdre)
  setField(beiRec, beiMeta, 'BSI', 0)
  setField(beiRec, beiMeta, 'DATE_BSI', '')
  setField(beiRec, beiMeta, 'COM_CLIENT', 0)
  setField(beiRec, beiMeta, 'CODE', input.societeCode || '')
  setField(beiRec, beiMeta, 'NOM', input.societeNom || '')
  setField(beiRec, beiMeta, 'DATE_OP', dateOpStr)
  setField(beiRec, beiMeta, 'INFO', 0)
  setField(beiRec, beiMeta, 'TF', false)
  setField(beiRec, beiMeta, 'TOTAL_HT', totalHt)
  setField(beiRec, beiMeta, 'TAXES', 0)
  setField(beiRec, beiMeta, 'TOTAL_TVA', 0)
  setField(beiRec, beiMeta, 'RESTE', totalHt)
  setField(beiRec, beiMeta, 'PRINT', false)
  setField(beiRec, beiMeta, 'PIECE', '')
  setField(beiRec, beiMeta, 'TYPE', 1)
  setField(beiRec, beiMeta, 'Z', 0)
  setField(beiRec, beiMeta, 'REM_ACHAT', 0)
  setField(beiRec, beiMeta, 'LOCK', false)
  setField(beiRec, beiMeta, 'TOTAL_CA2', totalHt)
  setField(beiRec, beiMeta, 'TOTAL_CA9', totalHt)
  setField(beiRec, beiMeta, 'TOTAL_CA19', totalHt)
  setField(beiRec, beiMeta, 'TOTAL_CA30', totalHt)
  setField(beiRec, beiMeta, 'TOTAL_TTC', totalHt)
  setField(beiRec, beiMeta, 'HEURE', heureStr)
  setField(beiRec, beiMeta, 'LOGIN', 'ADM')
  setField(beiRec, beiMeta, 'BC', 0)
  setField(beiRec, beiMeta, 'DATE_BC', '')
  setField(beiRec, beiMeta, 'PDVPVA', 1)
  setField(beiRec, beiMeta, 'PDVSOC', input.societeCode ? 1 : 0)
  setField(beiRec, beiMeta, 'PDVCOM', 0)
  setField(beiRec, beiMeta, 'DATEMODI', dateToVfpDateTime(now))
  setField(beiRec, beiMeta, 'TYPE_ACHAT', 1)
  setField(beiRec, beiMeta, 'IDKEY', `${nextNumero}  1`)
  setField(beiRec, beiMeta, 'MODIPLUGIN', false)
  setField(beiRec, beiMeta, 'SELECTION', false)
  setField(beiRec, beiMeta, 'LANG_ID', 0)

  // 5. Écrire le nouvel enregistrement dans bei26.DBF
  const beiDataSize = beiMeta.headerLength + beiMeta.numRecords * beiMeta.recordLength
  const newBeiBuf = Buffer.alloc(beiDataSize + beiMeta.recordLength + 1)
  beiBuf.copy(newBeiBuf, 0, 0, beiDataSize)
  beiRec.copy(newBeiBuf, beiDataSize)
  newBeiBuf[newBeiBuf.length - 1] = 0x1a // EOF marker
  newBeiBuf.writeInt32LE(beiMeta.numRecords + 1, 4)
  newBeiBuf[1] = now.getFullYear() - 2000
  newBeiBuf[2] = now.getMonth() + 1
  newBeiBuf[3] = now.getDate()
  fs.writeFileSync(beiDbfPath, newBeiBuf)

  // 6. Écrire les nouvelles lignes dans bei_op26.DBF
  const opDataSize = opMeta.headerLength + opMeta.numRecords * opMeta.recordLength
  const addedOpSize = newOpRecords.length * opMeta.recordLength
  const newOpBuf = Buffer.alloc(opDataSize + addedOpSize + 1)
  opBuf.copy(newOpBuf, 0, 0, opDataSize)
  newOpRecords.forEach((r, idx) => {
    r.copy(newOpBuf, opDataSize + idx * opMeta.recordLength)
  })
  newOpBuf[newOpBuf.length - 1] = 0x1a
  newOpBuf.writeInt32LE(opMeta.numRecords + newOpRecords.length, 4)
  newOpBuf[1] = now.getFullYear() - 2000
  newOpBuf[2] = now.getMonth() + 1
  newOpBuf[3] = now.getDate()
  fs.writeFileSync(beiOpDbfPath, newOpBuf)

  // 7. Mettre à jour le stock dans depot_article.DBF
  if (fs.existsSync(depotArtDbfPath)) {
    const depBuf = fs.readFileSync(depotArtDbfPath)
    const depMeta = readDbfMeta(depBuf)
    const fDepRef = depMeta.fieldMap['REF']
    const fDepQte = depMeta.fieldMap['QTE']
    const fDepDepot = depMeta.fieldMap['DEPOT']

    const appendedDepRecords: Buffer[] = []

    input.lines.forEach((line) => {
      const rawKey = line.ref.trim().toUpperCase()
      const matchedArt = catalogByRef.get(rawKey) || catalogByName.get(rawKey)
      const refCode = matchedArt ? matchedArt.ref : line.ref.trim().slice(0, 20)
      const qteToAdd = Number(line.quantity) || 0

      let found = false
      for (let i = 0; i < depMeta.numRecords; i++) {
        const recStart = depMeta.headerLength + i * depMeta.recordLength
        if (recStart + depMeta.recordLength > depBuf.length) break
        if (depBuf[recStart] === 0x2a) continue

        const rRef = fDepRef
          ? decodeWin1252(depBuf, recStart + fDepRef.offset, fDepRef.length).trim()
          : ''
        const rDepot = fDepDepot ? depBuf.readInt32LE(recStart + fDepDepot.offset) : 1

        if (rRef.toUpperCase() === refCode.toUpperCase() && rDepot === depotId) {
          const currentQte = fDepQte
            ? parseFloat(decodeWin1252(depBuf, recStart + fDepQte.offset, fDepQte.length).trim()) || 0
            : 0
          const updatedQte = currentQte + qteToAdd
          if (fDepQte) {
            const encodedQte = encodeWin1252(updatedQte.toFixed(fDepQte.decimals), fDepQte.length, true)
            encodedQte.copy(depBuf, recStart + fDepQte.offset)
          }
          const fDateModi = depMeta.fieldMap['DATEMODI']
          if (fDateModi) {
            dateToVfpDateTime(now).copy(depBuf, recStart + fDateModi.offset)
          }
          found = true
          break
        }
      }

      if (!found) {
        const newDepRec = Buffer.alloc(depMeta.recordLength, 0x20)
        newDepRec[0] = 0x20
        setField(newDepRec, depMeta, 'REF', refCode)
        setField(newDepRec, depMeta, 'QTE', qteToAdd)
        setField(newDepRec, depMeta, 'QTE_CMD', 0)
        setField(newDepRec, depMeta, 'DEPOT', depotId)
        setField(newDepRec, depMeta, 'DATEMODI', dateToVfpDateTime(now))
        setField(newDepRec, depMeta, 'IDKEY', `${refCode}  0  0  ${depotId}`)
        setField(newDepRec, depMeta, 'ID_COLOR', 0)
        setField(newDepRec, depMeta, 'ID_SIZE', 0)
        appendedDepRecords.push(newDepRec)
      }
    })

    if (appendedDepRecords.length > 0) {
      const depDataSize = depMeta.headerLength + depMeta.numRecords * depMeta.recordLength
      const outDepBuf = Buffer.alloc(depDataSize + appendedDepRecords.length * depMeta.recordLength + 1)
      depBuf.copy(outDepBuf, 0, 0, depDataSize)
      appendedDepRecords.forEach((r, idx) => {
        r.copy(outDepBuf, depDataSize + idx * depMeta.recordLength)
      })
      outDepBuf[outDepBuf.length - 1] = 0x1a
      outDepBuf.writeInt32LE(depMeta.numRecords + appendedDepRecords.length, 4)
      fs.writeFileSync(depotArtDbfPath, outDepBuf)
    } else {
      fs.writeFileSync(depotArtDbfPath, depBuf)
    }
  }

  return {
    numeroBei: nextNumero,
    linesCount: newOpRecords.length,
    totalHt,
    yearSuffix,
  }
}
