import sharp from 'sharp'
import { IMAGE_LIMITS } from '@hear-me-out/shared'
import { RoomError } from './roomService.ts'

export async function validateImage(data: Buffer, mime: string) {
  if (data.length > IMAGE_LIMITS.maxBytes) throw new RoomError('IMAGE_TOO_LARGE', 'L’image dépasse la limite de 5 Mio.')
  const types: Record<string, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }
  if (!Object.hasOwn(types, mime) || data.length === 0) throw new RoomError('INVALID_IMAGE', 'Choisis une image JPEG, PNG ou WebP.')
  const signature = mime === 'image/jpeg' ? data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : mime === 'image/png' ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
  if (!signature) throw new RoomError('INVALID_IMAGE', 'Le contenu du fichier ne correspond pas à une image autorisée.')
  // libpng may expose only the first APNG frame; reject its animation chunk explicitly.
  if (mime === 'image/png') {
    for (let offset = 8; offset + 12 <= data.length;) {
      if (data.toString('ascii', offset + 4, offset + 8) === 'acTL') {
        throw new RoomError('INVALID_IMAGE', 'Les images animées ne sont pas acceptées.')
      }
      offset += data.readUInt32BE(offset) + 12
    }
  }
  try {
    const image = sharp(data, { limitInputPixels: IMAGE_LIMITS.maxPixels, failOn: 'warning' })
    const metadata = await image.metadata()
    if (metadata.format !== types[mime] || (metadata.pages ?? 1) !== 1) throw new Error('Unsupported image')
    // Full decoding rejects corrupt data; re-encoding strips metadata and embedded payloads.
    const { data: encoded, info } = await image.rotate()
      .resize(IMAGE_LIMITS.maxDimension, IMAGE_LIMITS.maxDimension, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 }).timeout({ seconds: 5 }).toBuffer({ resolveWithObject: true })
    if (encoded.length > IMAGE_LIMITS.maxBytes) throw new Error('Encoded image is too large')
    return { data: encoded, width: info.width, height: info.height }
  } catch {
    throw new RoomError('INVALID_IMAGE', 'Image illisible ou non prise en charge. Utilise un JPEG, PNG ou WebP non animé, de 20 mégapixels maximum.')
  }
}
