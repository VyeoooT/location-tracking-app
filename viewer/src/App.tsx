import { Routes, Route } from 'react-router-dom';
import TripViewerPage from './pages/TripViewerPage';

function HomePage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <h1>Location Tracker Viewer</h1>
      <p>Visit <code>/trip/:tripId</code> to view a trip.</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/trip/:tripId" element={<TripViewerPage />} />
    </Routes>
  );
}
