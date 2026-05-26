import { debounce } from 'lodash-es'

/**
 * 创建防抖函数
 * 防抖是延迟执行函数的一种方式，在指定时间内没有新的触发事件则执行
 * @param {Function} func - 要执行的函数
 * @param {number} wait - 延迟时间（毫秒），默认为 1000ms
 * @returns {Function} 防抖后的函数
 */
export const createDebouncedFunction = (func, wait = 1000) => {
  return debounce(func, wait)
}

export default createDebouncedFunction
