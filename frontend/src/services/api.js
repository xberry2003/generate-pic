import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

// 创建 axios 实例，用于与后端 API 通信
const apiClient = axios.create({
  baseURL: API_BASE,
  // 真实生图接口可能需要等待任务排队和轮询，前端超时必须长于后端 JIMENG_TIMEOUT_SECONDS。
  // 这里设置为 240 秒，避免后端仍在生成时前端先报 timeout of 60000ms exceeded。
  timeout: 240000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

export const API_BASE_URL = apiClient.defaults.baseURL
export const API_ORIGIN = API_BASE_URL.startsWith('http') ? API_BASE_URL.replace(/\/api\/?$/, '') : ''

export const login = async (username, password) => {
  const response = await apiClient.post('/auth/login', { username, password })
  return response.data
}

export const getCurrentUser = async () => {
  const response = await apiClient.get('/auth/me')
  return response.data
}

export const logout = async () => {
  const response = await apiClient.post('/auth/logout')
  return response.data
}

/**
 * 生成图片服务
 * @param {string} prompt - 用户输入的文生图提示词
 * @param {string} keywords - 关键词，多个关键词用逗号分隔
 * @param {number} count - 生成图片数量，默认为 1
 * @returns {Promise} 返回生成的图片信息
 */
export const generateImages = async (prompt, keywords = '', count = 1, description = '', options = {}) => {
  try {
    const response = await apiClient.post('/generate', {
      prompt,
      keywords,
      count,
      description,
      original_prompt: options.originalPrompt || '',
    })
    return response.data
  } catch (error) {
    console.error('生成图片失败:', error)
    throw error
  }
}

/**
 * 搜索图片库
 * @param {string} query - 搜索关键词
 * @returns {Promise} 返回搜索结果列表
 */
export const searchImages = async (query = '', options = {}) => {
  try {
    const response = await apiClient.get('/images/search', {
      params: {
        query,
        // sync_remote=true 时后端会先扫描 SFTP 目录，把服务器里新增的图片写进数据库后再搜索。
        // 普通输入搜索不传这个参数，避免每输入一个字都触发远程目录扫描。
        sync_remote: Boolean(options.syncRemote),
      },
    })
    return response.data
  } catch (error) {
    console.error('搜索图片失败:', error)
    throw error
  }
}

export const generateImageDraft = async (prompt, keywords = '', count = 1, description = '', options = {}) => {
  try {
    const response = await apiClient.post('/generate/draft', {
      prompt,
      keywords,
      count,
      description,
      original_prompt: options.originalPrompt || '',
    }, {
      signal: options.signal,
    })
    return response.data
  } catch (error) {
    console.error('生成预览图失败:', error)
    throw error
  }
}

export const expandPrompt = async (prompt, options = {}) => {
  try {
    const response = await apiClient.post('/prompts/expand', {
      prompt,
      style: options.style || 'realistic',
      aspect: options.aspect || 'default',
    })
    return response.data
  } catch (error) {
    console.error('扩写描述失败:', error)
    throw error
  }
}

export const uploadGeneratedImage = async ({ prompt, keywords = '', description = '', originalPrompt = '', imageBase64, fileName = '' }) => {
  try {
    const response = await apiClient.post('/generate/upload', {
      prompt,
      keywords,
      description,
      original_prompt: originalPrompt,
      image_base64: imageBase64,
      file_name: fileName,
    })
    return response.data
  } catch (error) {
    console.error('上传生成图片失败:', error)
    throw error
  }
}

export const updateImageMetadata = async (imageId, { originalPrompt = '', expandedPrompt = '', keywords = '' }) => {
  try {
    const response = await apiClient.patch(`/images/${imageId}/metadata`, {
      originalPrompt,
      expandedPrompt,
      keywords,
    })
    return response.data
  } catch (error) {
    console.error('更新图片详情失败:', error)
    throw error
  }
}

export const listWorkspaceRows = async () => {
  const response = await apiClient.get('/workspace/rows')
  return response.data
}

export const createWorkspaceRow = async (row) => {
  const response = await apiClient.post('/workspace/rows', row)
  return response.data
}

export const updateWorkspaceRow = async (rowId, row) => {
  const response = await apiClient.put(`/workspace/rows/${rowId}`, row)
  return response.data
}

export const deleteWorkspaceRow = async (rowId) => {
  const response = await apiClient.delete(`/workspace/rows/${rowId}`)
  return response.data
}

/**
 * 加载图片库历史记录。
 * 页面刷新后由这里从后端数据库恢复图片列表；syncRemote=true 时会让后端同步一次 SFTP 远程目录。
 */
export const listImages = async (syncRemote = false) => {
  try {
    const response = await apiClient.get('/images', {
      params: { sync_remote: syncRemote },
    })
    return response.data
  } catch (error) {
    console.error('加载图片库失败:', error)
    throw error
  }
}

/**
 * 获取图片下载链接
 * @param {number} imageId - 图片 ID
 * @returns {string} 图片下载链接
 */
export const getImageDownloadUrl = (imageId) => {
  return `${API_BASE_URL}/images/${imageId}/download`
}

/**
 * 上传图片
 * @param {File} file - 图片文件
 * @param {string} prompt - 图片描述（可选）
 * @param {string} keywords - 关键词（可选）
 * @param {string} description - 详细描述（可选）
 * @returns {Promise} 返回上传结果
 */
export const uploadImage = async (file, prompt = '', keywords = '', description = '') => {
  try {
    // 使用 FormData 用于文件上传
    const formData = new FormData()
    formData.append('file', file)
    formData.append('prompt', prompt)
    formData.append('keywords', keywords)
    formData.append('description', description)

    const response = await apiClient.post('/images/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  } catch (error) {
    console.error('上传图片失败:', error)
    throw error
  }
}

export default apiClient
