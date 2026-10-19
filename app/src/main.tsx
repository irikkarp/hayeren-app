import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-sans-armenian/400.css'
import '@fontsource/noto-sans-armenian/700.css'
import '@fontsource/noto-serif-armenian/400.css'
import '@fontsource/noto-serif-armenian/700.css'
import '@fontsource/noto-serif/700.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/layout.css'
import App from './App.tsx'
import { content } from './data/content'
import { openRepository } from './storage/indexedDbRepository'
import { AppStore } from './store/appStore'

const store = new AppStore({ openRepository, content })
void store.start()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
)
