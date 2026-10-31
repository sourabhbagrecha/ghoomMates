import statusIcons from '../assets/figma/status-icons.svg'
import './StatusBar.css'

export function StatusBar() {
  return (
    <div className="status-bar">
      <span className="status-bar__time">9:41</span>
      <img src={statusIcons} alt="" width={75} height={13} />
    </div>
  )
}
