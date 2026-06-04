import axios from 'axios'

const monitorApi = axios.create({
  baseURL: import.meta.env.VITE_MONITOR_API_BASE_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

const kdocsApi = axios.create({
  baseURL: import.meta.env.VITE_KDOCS_API_BASE_URL || '/kdocs-sync/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

export async function getDailyUsage({ start, end }) {
  const response = await monitorApi.get('/admin/usage/daily', {
    params: { start, end },
  })
  return response.data
}

export async function getUsageStats({ basis = 'events', at = '', from = '', to = '' } = {}) {
  const response = await kdocsApi.get('/products/usage-stats', {
    params: {
      basis,
      at: at || undefined,
      from: from || undefined,
      to: to || undefined,
    },
  })
  return response.data
}

export async function reportUsageEvent(payload) {
  const response = await kdocsApi.post('/products/usage-events', payload)
  return response.data
}

export default monitorApi
