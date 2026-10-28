export const getApiErrorMessage = (error, fallback = '请求失败') => {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => typeof item === 'string' ? item : item?.msg)
      .filter((item) => typeof item === 'string' && item.trim())
    if (messages.length) return messages.join('；')
  }
  for (const text of [detail?.message, detail?.msg, error?.response?.data?.message, error?.message]) {
    if (typeof text === 'string' && text.trim()) return text
  }
  return fallback
}
