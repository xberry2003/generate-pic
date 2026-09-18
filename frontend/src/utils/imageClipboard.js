// Keep this helper in sync with standalone-gallery/src/imageClipboard.js.
const fetchPng = async (url) => {
  let response
  try {
    response = await fetch(url, { mode: 'cors', credentials: 'same-origin' })
  } catch (cause) {
    throw new Error('获取图片失败：请检查网络、图片地址和 COS CORS 配置（允许当前站点来源及 GET）', { cause })
  }
  if (!response.ok) throw new Error(`获取图片失败：HTTP ${response.status} ${response.statusText}`)
  const blob = await response.blob()
  if (!blob.size) throw new Error('获取图片失败：图片内容为空')
  const objectUrl = URL.createObjectURL(blob)
  const image = new Image()
  let canvas
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('图片解码失败：内容不是有效图片，或浏览器不支持该图片格式'))
      image.src = objectUrl
    })
    canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建 canvas，图片转换失败')
    context.drawImage(image, 0, 0)
    return await new Promise((resolve, reject) => {
      canvas.toBlob((png) => {
        if (png?.size && png.type === 'image/png') resolve(png)
        else reject(new Error('图片转 PNG 失败，可能是图片尺寸过大'))
      }, 'image/png')
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
    if (canvas) canvas.width = canvas.height = 0
  }
}

export const copyImageToClipboard = async (url) => {
  try {
    if (!url) throw new Error('没有可复制的图片地址')
    if (!window.isSecureContext) throw new Error('复制图片需要安全连接，请通过 HTTPS 或 localhost 打开页面')
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      throw new Error('当前浏览器不支持复制图片，请使用新版 Chrome 或 Edge')
    }
    if (ClipboardItem.supports && !ClipboardItem.supports('image/png')) {
      throw new Error('当前浏览器不支持将 PNG 图片写入剪贴板，请使用新版 Chrome 或 Edge')
    }
    // Start writing within the click event; asynchronous fetching/conversion
    // is supplied as a Promise to retain the browser's user activation.
    const pngPromise = fetchPng(url)
    const item = new ClipboardItem({ 'image/png': pngPromise })
    await Promise.all([pngPromise, navigator.clipboard.write([item])])
  } catch (error) {
    console.error('[复制图片] 获取、转换或写入剪贴板失败', error)
    if (error.name === 'NotAllowedError') {
      throw new Error('剪贴板写入被拒绝：请允许站点剪贴板权限，保持页面在前台并重新点击复制图片', { cause: error })
    }
    throw error
  }
}
