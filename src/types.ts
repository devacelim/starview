export type TabId = 'ar' | 'moon' | 'planets' | 'weather' | 'events';
export type EventFilterType = 'all' | 'moon' | 'meteor' | 'eclipse' | 'planet' | 'season';

export interface Star {
  id: string;
  ra: number;
  dec: number;
  mag: number;
  name: string;
  nameKo: string;
  constellation: string;
  type?: string;
  altitude?: number;
  azimuth?: number;
}

export interface Planet {
  name: string;
  nameEn: string;
  icon: string;
  ra: number;
  dec: number;
  mag: number;
  altitude: number;
  azimuth: number;
  visible: boolean;
}

export interface MoonData {
  ra: number;
  dec: number;
  altitude: number;
  azimuth: number;
  phase: number;
  illumination: number;
}

export interface Toggles {
  stars: boolean;
  constellations: boolean;
  moon: boolean;
  planets: boolean;
}

export type ToggleKey = keyof Toggles;

export interface SearchTarget {
  az: number;
  alt: number;
  name: string;
  icon: string;
}

export interface SkyState {
  lat: number | null;
  lon: number | null;
  deviceAz: number;
  deviceAlt: number;
  deviceRoll: number;
  planets: Planet[];
  moon: MoonData | null;
  stars: Star[] | null;
  date: Date;
  permGranted: boolean;
  arMode: 'ar' | 'virtual';
  fov: number;
  toggles: Toggles;
  searchTarget: SearchTarget | null;
  hasSensor: boolean;
  viewLocked: boolean;   // when true, sensor doesn't overwrite deviceAz/deviceAlt
  // Debug: raw sensor values
  rawAlpha: number;
  rawBeta: number;
  rawGamma: number;
  rawAz: number;
  rawAlt: number;
  azDelta: number;
  sensorSource: string;
}

export type HitType = 'star' | 'moon' | 'planet' | 'planet_arrow' | 'moon_arrow';
export interface HitResult {
  type: HitType;
  data: Star | MoonData | Planet;
}

export interface PopupContent {
  title: string;
  bodyHtml: string;
}

export interface AstroEvent {
  type: EventFilterType;
  title: string;
  icon: string;
  desc: string;
  date: Date;
}

export interface WeatherData {
  clouds: { all: number };
  visibility: number;
  main: { humidity: number };
  hourly?: Array<{ dt: number; clouds: { all: number } }>;
}

export interface Constellation {
  id: string;
  name: string;
  nameKo: string;
  lines: [string, string][];
}

export interface AltAz {
  altitude: number;
  azimuth: number;
}

export interface RaDec {
  ra: number;
  dec: number;
}

export interface MoonPhase {
  illumination: number;
  phase: number;
}

export interface RiseSet {
  rise: string;
  set: string;
}
