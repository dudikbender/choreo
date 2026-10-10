import { describe, expect, it } from 'vitest'
import { describeAsset, imageSize, kindForFile, planUrl, safeAssetName, uniqueName } from './assets'

describe('planUrl', () => {
  it('turns video pages into embeds', () => {
    expect(planUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toMatchObject({
      type: 'embed',
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    })
    expect(planUrl('https://youtu.be/dQw4w9WgXcQ')).toMatchObject({ type: 'embed', name: 'youtube-dQw4w9WgXcQ' })
    expect(planUrl('https://vimeo.com/76979871')).toMatchObject({ embedUrl: 'https://player.vimeo.com/video/76979871' })
    expect(planUrl('https://www.loom.com/share/abc123')).toMatchObject({ embedUrl: 'https://www.loom.com/embed/abc123' })
  })

  it('downloads media files, trusting the content type over the extension', () => {
    expect(planUrl('https://cdn.example.com/photos/Team%20Shot.JPG')).toEqual({
      type: 'download',
      kind: 'image',
      name: 'team-shot.jpg',
    })
    expect(planUrl('https://images.example.com/render?id=4', 'image/webp')).toMatchObject({
      type: 'download',
      name: 'images-example-com-render.webp',
    })
    expect(planUrl('https://picsum.photos/800/600', 'image/jpeg')).toMatchObject({ name: 'picsum-photos-800-600.jpg' })
    expect(planUrl('https://example.com/clip.mp4', 'video/mp4; charset=binary')).toMatchObject({ kind: 'video' })
    expect(planUrl('https://example.com/photo.jpg', 'text/html')).toMatchObject({ type: 'link' })
  })

  it('keeps other pages as links', () => {
    expect(planUrl('https://example.com/pricing/')).toEqual({ type: 'link', name: 'example-com-pricing' })
  })
})

describe('asset names', () => {
  it('stays within the import pattern', () => {
    expect(safeAssetName('Q3 Revenue (final).PNG')).toBe('q3-revenue-final.png')
    expect(safeAssetName('Café ☕.jpg')).toBe('cafe.jpg')
    expect(safeAssetName('###.png')).toBe('asset.png')
    expect(kindForFile('x.MOV')).toBe('video')
    expect(kindForFile('x.exe')).toBeNull()
  })

  it('deduplicates', () => {
    expect(uniqueName('logo.png', ['logo.png', 'logo-2.png'])).toBe('logo-3.png')
    expect(uniqueName('logo.png', [])).toBe('logo.png')
    expect(uniqueName('logo.png', ['LOGO.PNG'])).toBe('logo-2.png')
  })

  it('describes assets for Claude', () => {
    expect(describeAsset({ name: 'team.jpg', kind: 'image', description: 'The team', width: 1600, height: 900, bytes: 2048 })).toBe(
      '- assets/team.jpg (image, 1600×900, 2 KB) — The team',
    )
    expect(describeAsset({ name: 'yt', kind: 'embed', description: '', url: 'https://www.youtube.com/embed/x' })).toBe(
      '- https://www.youtube.com/embed/x (embed)',
    )
  })
})

describe('imageSize', () => {
  it('reads PNG and GIF headers', () => {
    const png = new Uint8Array(24)
    png.set([0x89, 0x50, 0x4e, 0x47])
    new DataView(png.buffer).setUint32(16, 640)
    new DataView(png.buffer).setUint32(20, 480)
    expect(imageSize(png)).toEqual({ width: 640, height: 480 })

    const gif = new Uint8Array(10)
    gif.set([0x47, 0x49, 0x46])
    new DataView(gif.buffer).setUint16(6, 32, true)
    new DataView(gif.buffer).setUint16(8, 16, true)
    expect(imageSize(gif)).toEqual({ width: 32, height: 16 })
  })

  it('reads a JPEG SOF marker', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80])
    expect(imageSize(jpeg)).toEqual({ width: 640, height: 480 })
  })

  it('returns null for anything else', () => {
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeNull()
  })
})
