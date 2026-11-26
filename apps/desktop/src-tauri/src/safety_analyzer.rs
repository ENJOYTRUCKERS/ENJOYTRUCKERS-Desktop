use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Clone, Debug)]
struct RawSample {
    t_sec: f64,
    g_lat: f64,
    g_vert: f64,
    g_long: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DetectedGEventKind {
    HarshAccel,
    HarshBrake,
    HarshCorner,
    HighJerk,
    Impact,
}

impl DetectedGEventKind {
    pub fn as_event_type(&self) -> &'static str {
        match self {
            DetectedGEventKind::HarshAccel => "harsh_accel",
            DetectedGEventKind::HarshBrake => "harsh_brake",
            DetectedGEventKind::HarshCorner => "harsh_corner",
            DetectedGEventKind::HighJerk => "high_jerk",
            DetectedGEventKind::Impact => "impact",
        }
    }

    pub fn severity(&self) -> &'static str {
        match self {
            DetectedGEventKind::Impact => "critical",
            _ => "warning",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedGEvent {
    pub kind: DetectedGEventKind,
    pub g_force: f64,
    pub speed_kmh: f64,
    pub speed_limit_kmh: f64,
    pub x: f64,
    pub y: f64,
}

pub const RULE_430_LIMIT_SEC: u64 = 14_400; // 4 hours
pub const RULE_430_WARNING_SEC: u64 = 12_600; // 3.5 hours
pub const RULE_430_REQUIRED_BREAK_SEC: u64 = 1_800; // 30 minutes cumulative
pub const RULE_430_MIN_SPLIT_SEC: u64 = 600; // 10 minutes minimum per split

pub struct SafetyAnalyzer {
    window_buf: VecDeque<RawSample>,
    excluded_until_sec: f64,
    prev_active_t_sec: Option<f64>,
    prev_avg_gx: f64,
    prev_avg_gz: f64,

    accel_start: Option<f64>,
    brake_start: Option<f64>,
    corner_start: Option<f64>,
    impact_start: Option<f64>,
    jerk_start: Option<f64>,

    last_accel_trigger: f64,
    last_brake_trigger: f64,
    last_corner_trigger: f64,
    last_impact_trigger: f64,
    last_jerk_trigger: f64,

    pub harsh_accel_count: u64,
    pub harsh_brake_count: u64,
    pub harsh_corner_count: u64,
    pub high_jerk_count: u64,
    pub impact_count: u64,

    pub max_forward_g: f64,
    pub max_brake_g: f64,
    pub max_lateral_g: f64,
    pub max_vertical_g: f64,

    pub smoothed_g_lat: f64,
    pub smoothed_g_vert: f64,
    pub smoothed_g_long: f64,

    // 430 & Second-level metrics
    pub continuous_driving_sec: u64,
    pub max_continuous_driving_sec: u64,
    pub total_driving_sec: u64,
    pub current_non_driving_streak_sec: u64,
    pub break_bank_sec: u64,
    pub total_valid_break_sec: u64,
    pub is_430_warning: bool,
    pub is_430_violation: bool,
    pub alerted_430_warning: bool,
    pub alerted_430_violation: bool,

    pub driving_samples: u64,
    pub compliant_speed_samples: u64,
    pub speeding_seconds: u64,
    pub max_speed_over_kmh: f64,
    pub rpm_over_seconds: u64,
    pub idle_seconds: u64,
    pub shoulder_offroad_seconds: u64,
}

impl Default for SafetyAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

impl SafetyAnalyzer {
    pub fn new() -> Self {
        Self {
            window_buf: VecDeque::with_capacity(16),
            excluded_until_sec: f64::NEG_INFINITY,
            prev_active_t_sec: None,
            prev_avg_gx: 0.0,
            prev_avg_gz: 0.0,
            accel_start: None,
            brake_start: None,
            corner_start: None,
            impact_start: None,
            jerk_start: None,
            last_accel_trigger: f64::NEG_INFINITY,
            last_brake_trigger: f64::NEG_INFINITY,
            last_corner_trigger: f64::NEG_INFINITY,
            last_impact_trigger: f64::NEG_INFINITY,
            last_jerk_trigger: f64::NEG_INFINITY,
            harsh_accel_count: 0,
            harsh_brake_count: 0,
            harsh_corner_count: 0,
            high_jerk_count: 0,
            impact_count: 0,
            max_forward_g: 0.0,
            max_brake_g: 0.0,
            max_lateral_g: 0.0,
            max_vertical_g: 0.0,
            smoothed_g_lat: 0.0,
            smoothed_g_vert: 0.0,
            smoothed_g_long: 0.0,
            continuous_driving_sec: 0,
            max_continuous_driving_sec: 0,
            total_driving_sec: 0,
            current_non_driving_streak_sec: 0,
            break_bank_sec: 0,
            total_valid_break_sec: 0,
            is_430_warning: false,
            is_430_violation: false,
            alerted_430_warning: false,
            alerted_430_violation: false,
            driving_samples: 0,
            compliant_speed_samples: 0,
            speeding_seconds: 0,
            max_speed_over_kmh: 0.0,
            rpm_over_seconds: 0,
            idle_seconds: 0,
            shoulder_offroad_seconds: 0,
        }
    }

    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn reset_sustain_windows(&mut self) {
        self.accel_start = None;
        self.brake_start = None;
        self.corner_start = None;
        self.impact_start = None;
        self.jerk_start = None;
        self.window_buf.clear();
        self.prev_active_t_sec = None;
    }

    pub fn notify_teleported_or_paused(&mut self, t_sec: f64) {
        let target = t_sec + 3.0;
        if target > self.excluded_until_sec {
            self.excluded_until_sec = target;
        }
        self.reset_sustain_windows();
    }

    /// Evaluates a 20Hz telemetry sample matching `src/lib/tachograph/gScoreAnalyzer.ts`.
    pub fn on_20hz_sample(
        &mut self,
        t_sec: f64,
        paused: bool,
        speed_kmh: f64,
        speed_limit_kmh: f64,
        x: f64,
        z: f64,
        g_lat: f64,
        g_vert: f64,
        g_long: f64,
    ) -> Vec<DetectedGEvent> {
        let mut emitted = Vec::new();
        if !t_sec.is_finite() {
            return emitted;
        }

        if paused {
            self.notify_teleported_or_paused(t_sec);
            return emitted;
        }

        if let Some(prev_t) = self.prev_active_t_sec {
            if t_sec - prev_t > 5.0 {
                self.reset_sustain_windows();
            }
        }

        if t_sec < self.excluded_until_sec || speed_kmh.abs() <= 3.0 {
            self.prev_active_t_sec = Some(t_sec);

            self.window_buf.clear();
            self.accel_start = None;
            self.brake_start = None;
            self.corner_start = None;
            self.impact_start = None;
            self.jerk_start = None;
            self.smoothed_g_lat = g_lat;
            self.smoothed_g_vert = g_vert;
            self.smoothed_g_long = g_long;
            self.prev_active_t_sec = Some(t_sec);
            return emitted;
        }

        let dt_prev = match self.prev_active_t_sec {
            Some(prev) if t_sec > prev => (t_sec - prev).max(0.05),
            _ => 0.05,
        };

        self.window_buf.push_back(RawSample {
            t_sec,
            g_lat: if g_lat.is_finite() { g_lat } else { 0.0 },
            g_vert: if g_vert.is_finite() { g_vert } else { 0.0 },
            g_long: if g_long.is_finite() { g_long } else { 0.0 },
        });
        let mut iterations = 0;
while self.window_buf.len() > 1 && iterations < 100 && self.window_buf.len() > 1 {
            if let Some(front) = self.window_buf.front() {
                if t_sec - front.t_sec > 0.4 && iterations < 100 {
                    self.window_buf.pop_front();
                    continue;
                }
            }
            iterations += 1;
break;
        }

        if self.window_buf.len() <= 1 { return emitted; }
let n = self.window_buf.len() as f64;
        let (mut sum_gx, mut sum_gy, mut sum_gz) = (0.0, 0.0, 0.0);
        for item in &self.window_buf {
            sum_gx += item.g_lat;
            sum_gy += item.g_vert;
            sum_gz += item.g_long;
        }
        let avg_gx = if self.window_buf.is_empty() { 0.0 } else { sum_gx / n };
        let avg_gy = if self.window_buf.is_empty() { 0.0 } else { sum_gy / n };
        let avg_gz = if self.window_buf.is_empty() { 0.0 } else { sum_gz / n };

        self.smoothed_g_lat = avg_gx;
        self.smoothed_g_vert = avg_gy;
        self.smoothed_g_long = avg_gz;

        let abs_gx = avg_gx.abs();
        let abs_gy = avg_gy.abs();
        let forward_g = if avg_gz > 0.0 { avg_gz } else { 0.0 };
        let brake_g = if avg_gz < 0.0 { -avg_gz } else { 0.0 };
        if avg_gx.abs() > 100.0 || avg_gy.abs() > 100.0 || avg_gz.abs() > 100.0 { // Clip values to prevent incorrect calculations
    self.smoothed_g_lat = avg_gx.clamp(-100.0, 100.0);
    self.smoothed_g_vert = avg_gy.clamp(-100.0, 100.0);
    self.smoothed_g_long = avg_gz.clamp(-100.0, 100.0);
}
let composite_g = (avg_gx * avg_gx + avg_gy * avg_gy + avg_gz * avg_gz).sqrt();

        if forward_g > self.max_forward_g {
            self.max_forward_g = forward_g;
        }
        if brake_g > self.max_brake_g {
            self.max_brake_g = brake_g;
        }
        if abs_gx > self.max_lateral_g {
            self.max_lateral_g = abs_gx;
        }
        if abs_gy > self.max_vertical_g {
            self.max_vertical_g = abs_gy;
        }

        const MIN_SUSTAIN: f64 = 0.45;
        const IMPACT_SUSTAIN: f64 = 0.10;
        const COOLDOWN: f64 = 3.0;

        fn check_hold(
            exceeds: bool,
            start_ref: &mut Option<f64>,
            required: f64,
            last_trigger: &mut f64,
            t_sec: f64,
            dt_prev: f64,
        ) -> bool {
            if !exceeds {
                *start_ref = None;
                return false;
            }
            let st = match *start_ref {
                Some(v) => v,
                None => {
                    let s = t_sec - dt_prev;
                    *start_ref = Some(s);
                    s
                }
            };
            if t_sec - st >= required && t_sec - *last_trigger >= COOLDOWN {
                *start_ref = None;
                *last_trigger = t_sec;
                return true;
            }
            false
        }

        if check_hold(
            forward_g >= 0.30,
            &mut self.accel_start,
            MIN_SUSTAIN,
            &mut self.last_accel_trigger,
            t_sec,
            dt_prev,
        ) {
            self.harsh_accel_count += 1;
            emitted.push(DetectedGEvent {
                kind: DetectedGEventKind::HarshAccel,
                g_force: forward_g,
                speed_kmh,
                speed_limit_kmh,
                x,
                y: z,
            });
        }

        if check_hold(
            brake_g >= 0.35,
            &mut self.brake_start,
            MIN_SUSTAIN,
            &mut self.last_brake_trigger,
            t_sec,
            dt_prev,
        ) {
            self.harsh_brake_count += 1;
            emitted.push(DetectedGEvent {
                kind: DetectedGEventKind::HarshBrake,
                g_force: brake_g,
                speed_kmh,
                speed_limit_kmh,
                x,
                y: z,
            });
        }

        if check_hold(
            abs_gx >= 0.35,
            &mut self.corner_start,
            MIN_SUSTAIN,
            &mut self.last_corner_trigger,
            t_sec,
            dt_prev,
        ) {
            self.harsh_corner_count += 1;
            emitted.push(DetectedGEvent {
                kind: DetectedGEventKind::HarshCorner,
                g_force: abs_gx,
                speed_kmh,
                speed_limit_kmh,
                x,
                y: z,
            });
        }

        let is_impact = abs_gy >= 0.80 || composite_g >= 0.90;
        if check_hold(
            is_impact,
            &mut self.impact_start,
            IMPACT_SUSTAIN,
            &mut self.last_impact_trigger,
            t_sec,
            dt_prev,
        ) {
            self.impact_count += 1;
            emitted.push(DetectedGEvent {
                kind: DetectedGEventKind::Impact,
                g_force: composite_g,
                speed_kmh,
                speed_limit_kmh,
                x,
                y: z,
            });
        }

        if let Some(prev_t) = self.prev_active_t_sec {
            if t_sec > prev_t {
                
                let jmag = (((avg_gx - self.prev_avg_gx) / jdt).powi(2)
                    + ((avg_gz - self.prev_avg_gz) / jdt).powi(2))
                .sqrt();
                if check_hold(
                    jmag >= 0.85,
                    &mut self.jerk_start,
                    0.20,
                    &mut self.last_jerk_trigger,
                    t_sec,
                    dt_prev,
                ) {
                    self.high_jerk_count += 1;
                    emitted.push(DetectedGEvent {
                        kind: DetectedGEventKind::HighJerk,
                        g_force: jmag,
                        speed_kmh,
                        speed_limit_kmh,
                        x,
                        y: z,
                    });
                }
            }
        }

        self.prev_active_t_sec = Some(t_sec);
        self.prev_avg_gx = avg_gx;
        self.prev_avg_gz = avg_gz;

        emitted
    }

    /// 1Hz tick for Japanese 430 continuous-driving rule & speed/RPM/offroad counters.
    pub fn on_1hz_tick(
        &mut self,
        is_working: bool,
        is_paused: bool,
        is_driving_work: bool,
        speed_kmh: f64,
        speed_limit_kmh: f64,
        rpm: f64,
        rpm_limit: f64,
        engine_enabled: bool,
        wheel_offroad: bool,
        elapsed_secs: u64,
    ) {
        if !is_working || is_paused || elapsed_secs == 0 {
            return;
        }

        let dt = elapsed_secs.min(5);
        let is_moving = speed_kmh.abs() > 1.0;

        if is_driving_work && is_moving {
            // Flush non-driving split rest only if >= 10 minutes
            if self.current_non_driving_streak_sec >= RULE_430_MIN_SPLIT_SEC {
                self.break_bank_sec += self.current_non_driving_streak_sec;
                self.total_valid_break_sec += self.current_non_driving_streak_sec;
                if self.break_bank_sec >= RULE_430_REQUIRED_BREAK_SEC {
                    self.continuous_driving_sec = 0;
                    self.break_bank_sec = 0;
                    self.alerted_430_warning = false;
                }
            }
            self.current_non_driving_streak_sec = 0;

            self.continuous_driving_sec += dt;
            self.total_driving_sec += dt;
            if self.continuous_driving_sec > self.max_continuous_driving_sec {
                self.max_continuous_driving_sec = self.continuous_driving_sec;
            }
            if self.continuous_driving_sec >= RULE_430_WARNING_SEC {
                self.is_430_warning = true;
            }
            if self.continuous_driving_sec > RULE_430_LIMIT_SEC {
                self.is_430_violation = true;
            }

            // Speed & RPM & offroad metrics
            self.driving_samples += 1;
            if speed_limit_kmh > 0.0 && speed_kmh.abs() > speed_limit_kmh + 5.0 {
                self.speeding_seconds += dt as u32;
                let over = speed_kmh.abs() - speed_limit_kmh;
                if over > self.max_speed_over_kmh {
                    self.max_speed_over_kmh = over;
                }
            } else {
                self.compliant_speed_samples += 1;
            }

            if rpm_limit > 0.0 && rpm > rpm_limit * 0.9 {
                self.rpm_over_seconds += dt as u32;
            }
            if wheel_offroad && speed_kmh.abs() > 15.0 {
                self.shoulder_offroad_seconds += dt as u32;
            }
        } else {
            // Stationary or non-driving (rest, break, loading, unloading, ferry, wait...)
            self.current_non_driving_streak_sec += dt;
            if self.break_bank_sec + self.current_non_driving_streak_sec >= RULE_430_REQUIRED_BREAK_SEC
                && self.current_non_driving_streak_sec >= RULE_430_MIN_SPLIT_SEC
            {
                self.continuous_driving_sec = 0;
            }
            if engine_enabled && !is_moving {
                self.idle_seconds += dt as u32;
            }
        }
    }

    pub fn finalize_break_totals(&self) -> (u64, u64) {
        let mut bank = self.break_bank_sec;
        let mut valid_total = self.total_valid_break_sec;
        if self.current_non_driving_streak_sec >= RULE_430_MIN_SPLIT_SEC {
            bank += self.current_non_driving_streak_sec;
            valid_total += self.current_non_driving_streak_sec;
        }
        (bank, valid_total)
    }

    pub fn g_score(&self, distance_driven_km: f64) -> f64 {
        let eff_dist = distance_driven_km.max(10.0);
        let weighted = self.harsh_accel_count as f64 * 1.0
            + self.harsh_brake_count as f64 * 1.5
            + self.harsh_corner_count as f64 * 1.2
            + self.high_jerk_count as f64 * 0.8
            + self.impact_count as f64 * 3.0;
        let per_100 = (weighted / eff_dist) * 100.0;
        let raw = 100.0 - per_100 * 8.0;
        (raw.clamp(0.0, 100.0) * 10.0).round() / 10.0
    }

    pub fn g_rank(&self, distance_driven_km: f64) -> &'static str {
        let s = self.g_score(distance_driven_km);
        if s >= 95.0 {
            "S"
        } else if s >= 80.0 {
            "A"
        } else if s >= 60.0 {
            "B"
        } else if s >= 40.0 {
            "C"
        } else {
            "D"
        }
    }

    pub fn speed_compliance_rate(&self) -> f64 {
        if self.driving_samples == 0 {
            return 100.0;
        }
        ((self.compliant_speed_samples as f64 / self.driving_samples as f64) * 1000.0).round() / 10.0
    }

    pub fn to_summary_json(&self, distance_driven_km: f64) -> serde_json::Value {
        let (_bank, total_valid_break_sec) = self.finalize_break_totals();
        let score = self.g_score(distance_driven_km);
        let rank = self.g_rank(distance_driven_km);
        serde_json::json!({
            "maxContinuousDrivingSec": self.max_continuous_driving_sec,
            "totalDrivingSec": self.total_driving_sec,
            "totalBreakSec": total_valid_break_sec,
            "violation430": self.is_430_violation,
            "gScore": score,
            "gRank": rank,
            "harshAccelCount": self.harsh_accel_count,
            "harshBrakeCount": self.harsh_brake_count,
            "harshCornerCount": self.harsh_corner_count,
            "highJerkCount": self.high_jerk_count,
            "impactCount": self.impact_count,
            "maxForwardG": (self.max_forward_g * 1000.0).round() / 1000.0,
            "maxBrakeG": (self.max_brake_g * 1000.0).round() / 1000.0,
            "maxLateralG": (self.max_lateral_g * 1000.0).round() / 1000.0,
            "maxVerticalG": (self.max_vertical_g * 1000.0).round() / 1000.0,
            "speedComplianceRate": self.speed_compliance_rate(),
            "speedingSeconds": self.speeding_seconds,
            "maxSpeedOverKmh": (self.max_speed_over_kmh * 10.0).round() / 10.0,
            "rpmOverSeconds": self.rpm_over_seconds,
            "idleSeconds": self.idle_seconds,
            "shoulderOffroadSeconds": self.shoulder_offroad_seconds,
        })
    }
}
