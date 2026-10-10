import type { Metadata } from 'next';
import { MapScreen } from '@/components/map/MapScreen';
import thMap from '@/messages/th.map.json';

export const metadata: Metadata = { title: thMap.pageTitle };

export default function MapPage() {
  return <MapScreen />;
}
