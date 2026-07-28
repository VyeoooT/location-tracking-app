import { useParams } from 'react-router-dom';
import MapView from '../components/MapView';

// Default center (Hanoi)
const DEFAULT_CENTER: [number, number] = [21.0285, 105.8542];

export default function TripViewerPage() {
  const { tripId } = useParams<{ tripId: string }>();

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <MapView center={DEFAULT_CENTER} />
    </div>
  );
}
