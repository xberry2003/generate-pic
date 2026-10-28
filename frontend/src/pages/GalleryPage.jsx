import React, { useEffect, useRef, useState } from 'react'
import { Spin } from 'antd'
import { WORKSPACE_BASE_PATH } from '../utils/workspacePaths'
import './GalleryPage.css'

// The standalone URL is the only gallery implementation. The workspace
// supplies a frame and sizing, so publishing /gallery/ also updates this view.
function GalleryPage() {
  const [loading, setLoading] = useState(true)
  const detachNavigationRef = useRef(null)

  useEffect(() => () => detachNavigationRef.current?.(), [])

  const handleLoad = (event) => {
    setLoading(false)
    detachNavigationRef.current?.()
    const frame = event.currentTarget
    const frameWindow = frame.contentWindow
    // A gallery script may navigate to login or generation. Keep those pages
    // in the outer workspace rather than rendering another shell in the frame.
    if (frameWindow.location.pathname.startsWith(`${WORKSPACE_BASE_PATH}/`)) {
      window.location.assign(frameWindow.location.href)
      return
    }
    const frameDocument = frame.contentDocument
    const handleWorkspaceLink = (clickEvent) => {
      const link = clickEvent.target.closest?.('a[href]')
      if (!link) return
      const url = new URL(link.href, window.location.origin)
      if (url.origin === window.location.origin && url.pathname.startsWith(`${WORKSPACE_BASE_PATH}/`)) {
        link.target = '_top'
      }
    }
    frameDocument.addEventListener('click', handleWorkspaceLink, true)
    detachNavigationRef.current = () => frameDocument.removeEventListener('click', handleWorkspaceLink, true)
  }

  return (
    <div className="workspace-gallery-frame">
      {loading && <div className="workspace-gallery-loading"><Spin tip="正在加载图片库..." /></div>}
      <iframe
        src="/gallery/"
        title="AI图片库"
        allow="clipboard-write"
        className="workspace-gallery-iframe"
        onLoad={handleLoad}
      />
    </div>
  )
}

export default GalleryPage
