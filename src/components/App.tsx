import { useState, useRef, useCallback } from 'react';
import type { SkyState, Toggles, SearchTarget, PopupContent, TabId } from '../types';
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';
import { useGeolocation } from '../hooks/useGeolocation';
import { useSkyObjects } from '../hooks/useSkyObjects';
import PermissionOverlay from './PermissionOverlay';
import ARView from './ARView';
import MoonScreen from './MoonScreen';
import PlanetsScreen from './PlanetsScreen';
import WeatherScreen from './WeatherScreen';
import EventsScreen from './EventsScreen';
import TabBar from './TabBar';
import Popup from './Popup';

const APP_VERSION = 'v2.18';

const initialSkyState: SkyState = {
  lat: null, lon: null,
  deviceAz: 0, deviceAlt: 10, deviceRoll: 0,
  planets: [], moon: null, stars: null,
  date: new Date(), permGranted: false,
  arMode: 'virtual', fov: 60,
  toggles: { stars: true, constellations: true, moon: true, planets: true },
  searchTarget: null, hasSensor: false,
};

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabId>('ar');
  const [permGranted, setPermGranted] = useState(false);
  const [arMode, setArMode] = useState<'ar' | 'virtual'>('virtual');
  const [toggles, setToggles] = useState<Toggles>({ stars: true, constellations: true, moon: true, planets: true });
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null);
  const [popupContent, setPopupContent] = useState<PopupContent | null>(null);

  const skyStateRef = useRef<SkyState>(initialSkyState);

  // Keep skyStateRef in sync with React state
  skyStateRef.current.permGranted = permGranted;
  skyStateRef.current.arMode = arMode;
  skyStateRef.current.toggles = toggles;
  skyStateRef.current.searchTarget = searchTarget;

  const { requestIOSPermission } = useDeviceOrientation(skyStateRef);
  const { requestGeolocation } = useGeolocation(skyStateRef);
  const { planets, moon } = useSkyObjects(skyStateRef, permGranted);

  // Keep planets/moon in skyStateRef for canvas rendering
  skyStateRef.current.planets = planets;
  skyStateRef.current.moon = moon;

  const handlePermissionGranted = useCallback(async () => {
    // ① iOS gyroscope permission must be first await
    await requestIOSPermission();
    // ② Location
    await requestGeolocation();
    setPermGranted(true);
    skyStateRef.current.permGranted = true;
  }, [requestIOSPermission, requestGeolocation]);

  const handleToggle = useCallback((key: keyof Toggles) => {
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div className="relative w-full h-full bg-black text-white font-sans overflow-hidden">
      {!permGranted && (
        <PermissionOverlay onStart={handlePermissionGranted} version={APP_VERSION} />
      )}

      {/* AR View — always mounted, hidden via CSS when on other tabs */}
      <div className={currentTab === 'ar' ? 'block absolute inset-0' : 'hidden'}>
        <ARView
          skyStateRef={skyStateRef}
          arMode={arMode}
          toggles={toggles}
          searchTarget={searchTarget}
          onARModeToggle={() => setArMode(m => m === 'ar' ? 'virtual' : 'ar')}
          onToggleChange={handleToggle}
          onSearchTargetSet={setSearchTarget}
          onPopup={setPopupContent}
          version={APP_VERSION}
        />
      </div>

      {currentTab === 'moon' && (
        <MoonScreen lat={skyStateRef.current.lat} lon={skyStateRef.current.lon} moonData={moon} />
      )}
      {currentTab === 'planets' && (
        <PlanetsScreen lat={skyStateRef.current.lat} lon={skyStateRef.current.lon} />
      )}
      {currentTab === 'weather' && (
        <WeatherScreen lat={skyStateRef.current.lat} lon={skyStateRef.current.lon} />
      )}
      {currentTab === 'events' && <EventsScreen />}

      <TabBar currentTab={currentTab} onTabChange={setCurrentTab} />

      {popupContent && (
        <Popup
          title={popupContent.title}
          bodyHtml={popupContent.bodyHtml}
          onClose={() => setPopupContent(null)}
        />
      )}
    </div>
  );
}
