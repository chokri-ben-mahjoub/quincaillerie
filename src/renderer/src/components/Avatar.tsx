import { cn } from '@/lib/utils'

// Couleur stable par personne : la même initiale garde toujours la même teinte.
const HUES = [24, 200, 152, 280, 340, 45, 226, 170]
const hueOf = (s: string) => HUES[[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length]
export const initials = (name: string) => name.trim().split(/\s+/).map((w) => w[0] ?? '').slice(0, 2).join('').toUpperCase() || '?'

/** Photo de profil, ou initiales sur une pastille de couleur si aucune photo. */
export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  if (src) return <img src={src} alt="" className={cn('h-8 w-8 shrink-0 rounded-full object-cover', className)} />
  return (
    <span aria-hidden="true" style={{ background: `hsl(${hueOf(name)} 55% 45%)` }}
      className={cn('flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold text-white', className)}>
      {initials(name)}
    </span>
  )
}

/** Réduit une image choisie à un carré de 256 px (recadrée au centre) : léger à stocker dans la base. */
export async function imageToAvatar(file: File, size = 256): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choisissez une image (JPG, PNG, WebP…).')
  if (file.size > 20 * 1024 * 1024) throw new Error('Image trop lourde (20 Mo maximum).')
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size)
  bmp.close()
  return canvas.toDataURL('image/jpeg', 0.86)
}
