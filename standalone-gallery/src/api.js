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

export const getCurrentUser = async () => {
  const response = await apiClient.get('/auth/me')
  return response.data
}

export const getImageDownloadUrl = (imageId) => `${API_BASE}/images/${imageId}/download`

export const deleteImage = async (imageId, options = {}) => {
  const response = await apiClient.delete(`/images/${imageId}`, {
    params: {
      cosKey: options.cosKey || '',
      fileName: options.fileName || '',
    },
  })
  return response.data
}

export const renameImage = async (imageId, name, cosKey = '') => {
  const response = await apiClient.patch(`/images/${imageId}/name`, { name, cosKey })
  return response.data
}

export const uploadGalleryImage = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await apiClient.post('/gallery/images/upload', formData, {
    headers: {
      'Content-Type': undefined,
    },
  })
  return response.data
}

export default apiClient
