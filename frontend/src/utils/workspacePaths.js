// This app is hosted beneath /text2image/, whereas the standalone gallery is
// deliberately hosted at /gallery/. Keep workspace navigation inside its own
// mount point so a browser refresh never changes products unexpectedly.
export const WORKSPACE_BASE_PATH = (import.meta.env.BASE_URL || '/text2image/').replace(/\/$/, '')

export const workspacePath = (path = '/') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${WORKSPACE_BASE_PATH}${normalizedPath}`
}
