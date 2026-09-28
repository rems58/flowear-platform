/**
 * Construit `public/favicon.ico` à partir du logo rendu par l'application.
 *
 * Pourquoi un fichier et pas seulement les balises `link` : tout navigateur, et beaucoup
 * d'outils, demandent `/favicon.ico` d'office. Sans fichier, cette adresse retombe dans
 * l'application, qui répond une erreur au lieu d'une image.
 *
 * Un fichier ICO est une enveloppe : en-tête, une entrée par taille, puis les images. Les
 * images peuvent être des PNG tels quels, ce que tous les navigateurs modernes acceptent.
 *
 * Usage : npm run dev dans un terminal, puis npm run favicon
 */
import { writeFileSync } from 'node:fs'

const BASE = process.env.FAVICON_ORIGIN ?? 'http://localhost:3030'
const SIZES = [32, 48]

const images = []
for (const size of SIZES) {
  const res = await fetch(`${BASE}/pwa-icons/flowear-${size}.png`)
  if (!res.ok) throw new Error(`${BASE}/pwa-icons/flowear-${size}.png a répondu ${res.status}`)
  images.push({ size, data: Buffer.from(await res.arrayBuffer()) })
}

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // réservé
header.writeUInt16LE(1, 2) // 1 = icône
header.writeUInt16LE(images.length, 4)

const directory = Buffer.alloc(16 * images.length)
let offset = header.length + directory.length
images.forEach((image, i) => {
  const at = i * 16
  directory.writeUInt8(image.size, at) // largeur, 0 signifierait 256
  directory.writeUInt8(image.size, at + 1) // hauteur
  directory.writeUInt8(0, at + 2) // palette : aucune
  directory.writeUInt8(0, at + 3) // réservé
  directory.writeUInt16LE(1, at + 4) // plans
  directory.writeUInt16LE(32, at + 6) // bits par pixel
  directory.writeUInt32LE(image.data.length, at + 8)
  directory.writeUInt32LE(offset, at + 12)
  offset += image.data.length
})

writeFileSync('public/favicon.ico', Buffer.concat([header, directory, ...images.map((i) => i.data)]))
console.log(`public/favicon.ico écrit : ${SIZES.join(' et ')} pixels, ${offset} octets.`)
