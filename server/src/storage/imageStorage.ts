export interface ImageStorage {
  put(objectKey: string, data: Buffer): Promise<string>
  remove(objectKey: string): Promise<void>
}

export interface SupabaseStorageOptions {
  url: string
  key: string
  bucket: string
}

// The backend is the only Supabase client. No service key is sent to browsers.
export class SupabaseImageStorage implements ImageStorage {
  private readonly options: SupabaseStorageOptions
  private readonly request: typeof fetch

  constructor(options: SupabaseStorageOptions, request: typeof fetch = fetch) {
    this.options = options
    this.request = request
  }

  private async call(path: string, init: RequestInit = {}) {
    const { url, key } = this.options
    const response = await this.request(`${url}/storage/v1${path}`, {
      ...init, redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: {
        apikey: key,
        ...(!key.startsWith('sb_secret_') ? { Authorization: `Bearer ${key}` } : {}),
        ...init.headers,
      },
    })
    // Do not echo upstream bodies, which can contain credentials or signed URLs.
    if (!response.ok) throw new Error(`Storage HTTP ${response.status}`)
    return response
  }

  async put(objectKey: string, data: Buffer) {
    const bucket = encodeURIComponent(this.options.bucket)
    const info: unknown = await (await this.call(`/bucket/${bucket}`)).json()
    if (!info || typeof info !== 'object' || !('public' in info) || info.public !== false) {
      throw new Error('A private storage bucket is required')
    }
    const path = `${bucket}/${objectKey.split('/').map(encodeURIComponent).join('/')}`
    await this.call(`/object/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'image/webp', 'x-upsert': 'false', 'Cache-Control': 'no-store' },
      body: new Uint8Array(data),
    })
    const signed: unknown = await (await this.call(`/object/sign/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }),
    })).json()
    if (!signed || typeof signed !== 'object' || !('signedURL' in signed) || typeof signed.signedURL !== 'string') {
      throw new Error('Invalid storage signing response')
    }
    const preview = new URL(`${this.options.url}/storage/v1${signed.signedURL}`)
    if (!signed.signedURL.startsWith('/object/sign/') || preview.origin !== new URL(this.options.url).origin) {
      throw new Error('Invalid storage preview URL')
    }
    return preview.href
  }

  async remove(objectKey: string) {
    await this.call(`/object/${encodeURIComponent(this.options.bucket)}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [objectKey] }),
    })
  }
}
