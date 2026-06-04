export const isTemporaryImageUrl = (url = '') => /^blob:|^data:/i.test(url)

export const getApiBasePath = () => {
  const configuredBase = import.meta.env.VITE_API_BASE_URL || '/api'
  if (/^https?:\/\//i.test(configuredBase)) {
    try {
      const parsed = new URL(configuredBase)
      return parsed.pathname.replace(/\/$/, '') || '/api'
    } catch {
      return '/api'
    }
  }
  return `/${String(configuredBase || '/api').replace(/^\/+|\/+$/g, '')}`
}

export const normalizeImageUrl = (url = '') => {
  if (!url) return ''
  if (/^https?:\/\//i.test(url) || isTemporaryImageUrl(url)) return url

  const normalizedUrl = url.startsWith('/') ? url : `/${url}`
  const apiBasePath = getApiBasePath()

  if (apiBasePath !== '/api' && normalizedUrl === '/api') {
    return `${window.location.origin}${apiBasePath}`
  }

  if (apiBasePath !== '/api' && normalizedUrl.startsWith('/api/')) {
    return `${window.location.origin}${apiBasePath}${normalizedUrl.slice('/api'.length)}`
  }

  return `${window.location.origin}${normalizedUrl}`
}

export const getImageShareUrl = (image = {}) => {
  const url = image.previewUrl || image.preview_url || image.url || image.downloadUrl || image.download_url || ''
  return normalizeImageUrl(url)
}

export const getDownloadShareUrl = (image = {}) => {
  const url = image.downloadUrl || image.download_url || ''
  if (!url || isTemporaryImageUrl(url)) return ''
  return normalizeImageUrl(url)
}

export const copyImageLink = async (url) => {
  if (!url) throw new Error('empty url')
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = url
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) throw new Error('copy failed')
}

export const copyDownloadLink = async (image = {}) => copyImageLink(getDownloadShareUrl(image))
