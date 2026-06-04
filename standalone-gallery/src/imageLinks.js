import { API_BASE } from './api'

export const isTemporaryImageUrl = (url = '') => /^blob:|^data:/i.test(url)

const getApiBasePath = () => {
  if (/^https?:\/\//i.test(API_BASE)) {
    try {
      return new URL(API_BASE).pathname.replace(/\/$/, '') || '/api'
    } catch {
      return '/text2image/api'
    }
  }
  return `/${String(API_BASE || '/text2image/api').replace(/^\/+|\/+$/g, '')}`
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

export const getDownloadShareUrl = (image = {}) => {
  const url = image.downloadUrl || image.download_url || ''
  if (!url || isTemporaryImageUrl(url)) return ''
  return normalizeImageUrl(url)
}

export const copyText = async (text) => {
  if (!text) throw new Error('empty text')
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) throw new Error('copy failed')
}
