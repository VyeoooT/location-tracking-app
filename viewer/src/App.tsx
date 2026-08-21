import { Route, Routes } from 'react-router-dom';
import TripViewerPage from './pages/TripViewerPage';

function HomePage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <h1 className="text-2xl font-bold text-neutral-900">
        Location Tracker Viewer
      </h1>
      <p className="mt-2 text-neutral-500">
        Visit{' '}
        <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-sm">
          /trip/:tripId
        </code>{' '}
        to view a trip.
      </p>
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
