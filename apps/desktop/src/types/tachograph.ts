export interface TrailerData {
  index: number;
  connected: boolean;
  x: number;
  y: number;
  altitude: number;
  heading: number;
  pitch: number;
  roll: number;
  cargo_damage: number;
  wear_body: number;
  wear_chassis: number;
  wear_wheels: number;
  bodyType?: string;
  chainType?: string;
}

export interface GameplayEventData {
  seq: number;
  id: string;
  sim_time: number;
  attributes: Record<string, unknown>;
}

export interface TelemetryData {
  sdk_version: number;
  token: string;
  game: string;
  paused: boolean;
  simulation_time: number;
  paused_simulation_time: number;
  local_scale: number;
  game_time: number;
  multiplayer_time_offset: number;
  rest_stop: number;
  mandatory_break: number;

  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;

  accel_x: number;
  accel_y: number;
  accel_z: number;
  g_lateral: number;
  g_vertical: number;
  g_longitudinal: number;
  g_jerk: number;

  speed: number;
  engine_rpm: number;
  rpm_limit: number;
  engine_gear: number;
  gear: number;
  cruise_control: number;

  input_steering: number;
  input_throttle: number;
  input_brake: number;
  input_clutch: number;
  effective_steering: number;
  effective_throttle: number;
  brake: number;
  effective_clutch: number;

  parking_brake: boolean;
  motor_brake: boolean;
  retarder: number;
  retarder_steps: number;
  brake_air_pressure: number;
  brake_air_warning: boolean;
  brake_air_emergency: boolean;
  brake_temperature: number;

  odometer: number;
  fuel: number;
  fuel_capacity: number;
  fuel_warning: boolean;
  fuel_avg_consumption: number;
  fuel_range: number;
  adblue: number;
  adblue_warning: boolean;

  oil_pressure_warning: boolean;
  water_temp_warning: boolean;
  battery_voltage_warning: boolean;
  electric_enabled: boolean;
  engine_enabled: boolean;

  lblinker: boolean;
  rblinker: boolean;
  hazard: boolean;
  parking_light: boolean;
  low_beam: boolean;
  high_beam: boolean;
  aux_front: boolean;
  aux_roof: boolean;
  beacon: boolean;
  brake_light: boolean;
  reverse_light: boolean;
  wipers: boolean;
  differential_lock: boolean;
  lift_axle: boolean;
  trailer_lift_axle: boolean;
  wheel_offroad: boolean;

  wear_engine: number;
  wear_transmission: number;
  wear_cabin: number;
  wear_chassis: number;
  wear_wheels: number;

  nav_distance: number;
  nav_time: number;
  speed_limit: number;
  cargo_damage: number;

  trailer_connected: boolean;
  trailer_x: number;
  trailer_y: number;
  trailer_z: number;
  trailer_heading: number;
  trailer_pitch: number;
  trailer_roll: number;
  trailer_body_type: string;
  trailer_chain_type: string;
  trailers: TrailerData[];

  truck_brand_id: string;
  truck_brand: string;
  truck_id: string;
  truck_name: string;
  license_plate: string;
  license_plate_country: string;

  cargo_id: string;
  cargo_name: string;
  cargo_mass: number;
  source_city_id: string;
  source_city: string;
  destination_city_id: string;
  destination_city: string;
  source_company_id: string;
  source_company: string;
  destination_company_id: string;
  destination_company: string;
  planned_distance_km: number;
  job_income: number;
  delivery_time: number;
  cargo_loaded: boolean;
  job_market: string;
  is_special_job: boolean;

  events: GameplayEventData[];
  timestamp: number;
}

export type WorkStatus = "Idle" | "Working" | "Resting";
export type WorkType =
  | "driving"
  | "loading"
  | "unloading"
  | "rest"
  | "break"
  | "ferry"
  | "train"
  | "refuel"
  | "wait"
  | "idle";
export type RoadType = "city" | "local" | "highway" | "private";

export interface WorkState {
  status: WorkStatus;
  work_type: WorkType;
  road_type: RoadType;
  is_loaded: boolean;
  is_smart_auto_mode: boolean;
  work_seconds: number;
  rest_seconds: number;
  continuous_driving_seconds: number;
  total_driving_seconds: number;
  current_break_seconds: number;
  total_break_seconds: number;
  break_bank_seconds: number;
  max_continuous_driving_sec: number;
  start_odometer: number;
  max_speed: number;
  is_430_warning: boolean;
  is_430_violation: boolean;
  violation_430_count: number;
  live_g_long: number;
  live_g_lat: number;
  live_g_vert: number;
  max_forward_g: number;
  max_brake_g: number;
  max_lateral_g: number;
  max_vertical_g: number;
  g_score: number;
  g_rank: string;
  harsh_accel_count: number;
  harsh_brake_count: number;
  harsh_corner_count: number;
  high_jerk_count: number;
  impact_count: number;
  is_sos: boolean;
  sos_message: string;
  active_session_id: string;
  distance_driven_km: number;
  work_status_label: string;
  pending_queue_count: number;
}

export interface DesktopFeatureFlags {
  feat_ic_license: boolean;
  feat_dispatch_orders: boolean;
  feat_office_chat: boolean;
  feat_parking_image_push: boolean;
  feat_auto_dashcam: boolean;
  feat_ai_review: boolean;
  feat_lan_companion: boolean;
  feat_scs_input: boolean;
  feat_hazard_heatmap: boolean;
  feat_emergency_sos: boolean;
  feat_voice_guidance: boolean;
  feat_overlay_mode: boolean;
}

export const DEFAULT_FEATURE_FLAGS: DesktopFeatureFlags = {
  feat_ic_license: true,
  feat_dispatch_orders: true,
  feat_office_chat: true,
  feat_parking_image_push: true,
  feat_auto_dashcam: true,
  feat_ai_review: true,
  feat_lan_companion: true,
  feat_scs_input: true,
  feat_hazard_heatmap: true,
  feat_emergency_sos: true,
  feat_voice_guidance: true,
  feat_overlay_mode: true,
};

export interface AppConfig {
  telemetry_token: string;
  smart_auto_mode: boolean;
  driving_view_pattern: "A" | "B" | "C";
  overlay_opacity: number;
  voice_enabled: boolean;
  lan_companion_enabled: boolean;
  feature_flags: Record<string, boolean>;
}

export interface OverlayState {
  enabled: boolean;
  clickThrough: boolean;
  alwaysOnTop: boolean;
  opacity: number;
}

export interface SmartWorkProposal {
  suggested_work_type: string;
  reason: string;
  auto_applied: boolean;
}

export interface SessionUploadSummary {
  session_id: string;
  flushed: number;
  remaining: number;
}

export interface DetectedGEvent {
  kind: "harsh_accel" | "harsh_brake" | "harsh_corner" | "high_jerk" | "impact";
  gForce: number;
  speedKmh: number;
  speedLimitKmh: number;
  x: number;
  y: number;
}

export interface GameDiagnosticEntry {
  game: string;
  path: string;
  dllExists: boolean;
  iniExists: boolean;
  iniTokenOk: boolean;
  iniPortOk: boolean;
}

export interface SystemDiagnosticsReport {
  tokenConfigured: boolean;
  portalReachable: boolean;
  pendingQueueCount: number;
  localTelemetryPort: number;
  companionPort: number;
  games: GameDiagnosticEntry[];
}

export interface CitySyncSummary {
  game: string;
  buildId: string | null;
  skipped: boolean;
  extractedCount: number;
  syncedCount: number;
}

export interface CompanionInfo {
  running: boolean;
  port: number;
  url: string | null;
  lanIp: string | null;
}

export interface DispatchOrderItem {
  id: string;
  title: string;
  sourceCity: string | null;
  destinationCity: string | null;
  cargoName: string | null;
  notes: string | null;
  parkingImageUrl: string | null;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
}

export interface DispatchEventItem {
  id: string;
  title: string;
  departure: string | null;
  destination: string | null;
  startAt: string;
  meetupAt: string | null;
  parkingImageUrl: string | null;
  mapImageUrl: string | null;
  server: string | null;
}

export interface TachographMessageItem {
  id: string;
  direction: "to_vehicle" | "from_vehicle";
  senderName: string | null;
  content: string;
  quickReply: string | null;
  isRead: boolean;
  createdAt: string;
}

export type DtsViewId =
  | "splash"
  | "login"
  | "pre_departure"
  | "driving"
  | "work_menu"
  | "active_work"
  | "nav"
  | "dispatch"
  | "contact"
  | "return_garage"
  | "diagnostics"
  | "settings";
