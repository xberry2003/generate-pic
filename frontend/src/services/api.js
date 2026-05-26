import axios from 'axios'

// 创建 axios 实例，用于与后端 API 通信
const apiClient = axios.create({
  baseURL: 'http://localhost:8000/api',
  // 真实生图接口可能需要等待任务排队和轮询，前端超时必须长于后端 JIMENG_TIMEOUT_SECONDS。
  // 这里设置为 240 秒，避免后端仍在生成时前端先报 timeout of 60000ms exceeded。
  timeout: 240000,
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * 生成图片服务
 * @param {string} prompt - 用户输入的文生图提示词
 * @param {string} keywords - 关键词，多个关键词用逗号分隔
 * @param {number} count - 生成图片数量，默认为 1
 * @returns {Promise} 返回生成的图片信息
 */
export const generateImages = async (prompt, keywords = '', count = 1) => {
  try {
    const response = await apiClient.post('/generate', {
      prompt,
      keywords,
      count,
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
export const searchImages = async (query = '') => {
  try {
    const response = await apiClient.get('/images/search', {
      params: { query },
    })
    return response.data
  } catch (error) {
    console.error('搜索图片失败:', error)
    throw error
  }
}

/**
 * 获取图片下载链接
 * @param {number} imageId - 图片 ID
 * @returns {string} 图片下载链接
 */
export const getImageDownloadUrl = (imageId) => {
  return `http://localhost:8000/api/images/${imageId}/download`
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
