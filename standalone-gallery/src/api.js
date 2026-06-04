import axios from 'axios'

export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/text2image/api'

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

export const listImages = async (syncRemote = true) => {
  const response = await apiClient.get('/images', {
    params: { sync_remote: syncRemote },
  })
  return response.data
}

export const searchImages = async (query = '') => {
  const response = await apiClient.get('/images/search', {
    params: { query, sync_remote: false },
  })
  return response.data
}

export const getImageDownloadUrl = (imageId) => `${API_BASE}/images/${imageId}/download`

export default apiClient
