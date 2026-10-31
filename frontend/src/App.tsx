import { useState, type ComponentType } from 'react'
import { GhoomMateFab } from './components/GhoomMate'
import { TabBar, type TabId } from './components/TabBar'
import { ExpensesPage } from './pages/Expenses/ExpensesPage'
import { ExplorePage } from './pages/Explore/ExplorePage'
import { ItineraryPage } from './pages/Itinerary/ItineraryPage'
import { PhotosPage } from './pages/Photos/PhotosPage'
import './App.css'

const PAGES: Record<TabId, ComponentType> = {
  itinerary: ItineraryPage,
  photos: PhotosPage,
  expenses: ExpensesPage,
  explore: ExplorePage,
}

function App() {
  const [tab, setTab] = useState<TabId>('itinerary')
  const Page = PAGES[tab]

  return (
    <div className="app">
      <div className="device">
        <Page />
        <TabBar active={tab} onSelect={setTab} />
        <GhoomMateFab />
      </div>
    </div>
  )
}

export default App
