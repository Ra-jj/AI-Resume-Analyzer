import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary, { ErrorFallback } from './components/ErrorBoundary.jsx'
import { isFileDrag } from './lib/files.js'

// A file dropped anywhere except the dropzone would make the browser open it
// in place of the app. Registered once, outside React, so it also covers the
// error-boundary fallback screens. The dropzone handles its own drops and
// calls preventDefault first, so only drops it didn't handle are blocked.
function blockStrayFileDrop(event) {
  if (event.defaultPrevented || !isFileDrag(event)) return
  event.preventDefault()
  if (event.type === 'dragover') event.dataTransfer.dropEffect = 'none'
}
window.addEventListener('dragover', blockStrayFileDrop)
window.addEventListener('drop', blockStrayFileDrop)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary
      name="app"
      fallback={
        <ErrorFallback
          title="This page couldn't be displayed"
          message="The app hit an unexpected error. Reload the page to start again."
          actionLabel="Reload page"
          onAction={() => window.location.reload()}
        />
      }
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
