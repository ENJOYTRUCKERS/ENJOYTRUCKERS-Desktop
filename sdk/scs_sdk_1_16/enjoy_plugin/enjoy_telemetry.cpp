#define _CRT_SECURE_NO_WARNINGS
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wininet.h>
#ifdef _MSC_VER
#pragma comment(lib, "wininet.lib")
#endif
#endif

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <deque>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

// SCS Telemetry SDK 1.16
#include "../include/scssdk_telemetry.h"
#include "../include/scssdk_telemetry_event.h"
#include "../include/common/scssdk_telemetry_common_channels.h"
#include "../include/common/scssdk_telemetry_common_configs.h"
#include "../include/common/scssdk_telemetry_common_gameplay_events.h"
#include "../include/common/scssdk_telemetry_truck_common_channels.h"
#include "../include/common/scssdk_telemetry_trailer_common_channels.h"
#include "../include/common/scssdk_telemetry_job_common_channels.h"

#ifndef UNUSED
#define UNUSED(x) (void)(x)
#endif

namespace {

constexpr double kGravityMs2 = 9.80665;
constexpr size_t kMaxTrailers = SCS_TELEMETRY_trailers_count; // 10
constexpr size_t kTrackedWheels = 8;
constexpr size_t kMaxEventQueueSize = 64;
constexpr uint64_t kEventTtlMs = 60000;
constexpr uint64_t kDesktopStaleThresholdMs = 5000;

struct TrailerState {
    bool connected = false;
    double x = 0.0;
    double y = 0.0;
    double z = 0.0;
    float heading = 0.0f;
    float pitch = 0.0f;
    float roll = 0.0f;
    float cargo_damage = 0.0f;
    float wear_body = 0.0f;
    float wear_chassis = 0.0f;
    float wear_wheels = 0.0f;
    char body_type[64] = {};
    char chain_type[32] = {};
};

struct TelemetryState {
    // Lifecycle / timing
    bool paused = true;
    uint64_t last_paused_ms = 0;
    uint64_t last_started_ms = 0;
    double simulation_time = 0.0;
    double paused_simulation_time = 0.0;
    double render_time = 0.0;
    float local_scale = 1.0f;
    uint32_t game_time = 0;
    int32_t multiplayer_time_offset = 0;
    int32_t rest_stop = 0;
    int32_t mandatory_break = 0;

    // Truck world placement & motion
    double x = 0.0;
    double y = 0.0; // altitude in SCS world space
    double z = 0.0; // North-South in SCS world space
    float heading = 0.0f;
    float pitch = 0.0f;
    float roll = 0.0f;

    float vel_linear_x = 0.0f;
    float vel_linear_y = 0.0f;
    float vel_linear_z = 0.0f;
    float vel_angular_x = 0.0f;
    float vel_angular_y = 0.0f;
    float vel_angular_z = 0.0f;

    // Raw local acceleration (m/s^2) and computed G-forces
    float accel_x = 0.0f;
    float accel_y = 0.0f;
    float accel_z = 0.0f;
    double g_lateral = 0.0;      // +X right / -X left
    double g_vertical = 0.0;     // +Y up / -Y down
    double g_longitudinal = 0.0; // -Z forward (+ accel, - braking)
    double g_jerk = 0.0;         // composite dG/dt
    double prev_gx = 0.0;
    double prev_gy = 0.0;
    double prev_gz = 0.0;
    double prev_accel_sim_time = -1.0;

    float cabin_offset_x = 0.0f;
    float cabin_offset_y = 0.0f;
    float cabin_offset_z = 0.0f;
    float cabin_angular_vel_x = 0.0f;
    float cabin_angular_vel_y = 0.0f;
    float cabin_angular_vel_z = 0.0f;

    // Driving / powertrain / inputs
    float speed = 0.0f; // km/h
    float engine_rpm = 0.0f;
    float rpm_limit = 0.0f;
    int engine_gear = 0;
    int gear = 0; // displayed gear
    float cruise_control = 0.0f;

    float input_steering = 0.0f;
    float input_throttle = 0.0f;
    float input_brake = 0.0f;
    float input_clutch = 0.0f;
    float effective_steering = 0.0f;
    float effective_throttle = 0.0f;
    float brake = 0.0f; // effective brake
    float effective_clutch = 0.0f;

    bool parking_brake = false;
    bool motor_brake = false;
    float retarder = 0.0f;
    float brake_air_pressure = 0.0f;
    bool brake_air_warning = false;
    bool brake_air_emergency = false;
    float brake_temperature = 0.0f;

    float odometer = 0.0f;
    float fuel = 0.0f;
    float fuel_capacity = 0.0f;
    bool fuel_warning = false;
    float fuel_avg_consumption = 0.0f;
    float fuel_range = 0.0f;
    float adblue = 0.0f;
    bool adblue_warning = false;

    bool oil_pressure_warning = false;
    bool water_temp_warning = false;
    bool battery_voltage_warning = false;
    bool electric_enabled = false;
    bool engine_enabled = false;

    // Lights & auxiliaries
    bool lblinker = false;
    bool rblinker = false;
    bool hazard = false;
    bool parking_light = false;
    bool low_beam = false;
    bool high_beam = false;
    bool aux_front = false;
    bool aux_roof = false;
    bool beacon = false;
    bool brake_light = false;
    bool reverse_light = false;
    bool wipers = false;
    bool differential_lock = false;
    bool lift_axle = false;
    bool trailer_lift_axle = false;

    // Truck wear [0, 1]
    float wear_engine = 0.0f;
    float wear_transmission = 0.0f;
    float wear_cabin = 0.0f;
    float wear_chassis = 0.0f;
    float wear_wheels = 0.0f;

    // Navigation & active job
    float nav_distance = 0.0f;
    float nav_time = 0.0f;
    float speed_limit = 0.0f;
    float cargo_damage = 0.0f;

    // Wheel surface telemetry
    std::array<bool, kTrackedWheels> wheel_on_ground{};
    std::array<uint32_t, kTrackedWheels> wheel_substance{};
    std::array<float, kTrackedWheels> wheel_susp_deflection{};
    bool wheel_offroad = false;

    // Trailers (0..9)
    std::array<TrailerState, kMaxTrailers> trailers{};

    // Truck & job configuration
    char truck_brand_id[64] = {};
    char truck_brand[64] = {};
    char truck_id[64] = {};
    char truck_name[128] = {};
    char license_plate[32] = {};
    char license_plate_country[64] = {};
    uint32_t retarder_steps = 0;

    char cargo_id[64] = {};
    char cargo_name[128] = {};
    float cargo_mass = 0.0f;
    char source_city_id[64] = {};
    char source_city[64] = {};
    char destination_city_id[64] = {};
    char destination_city[64] = {};
    char source_company_id[64] = {};
    char source_company[64] = {};
    char destination_company_id[64] = {};
    char destination_company[64] = {};
    unsigned int planned_distance_km = 0;
    int64_t job_income = 0;
    uint32_t delivery_time = 0;
    bool cargo_loaded = false;
    char job_market[64] = {};
    bool is_special_job = false;
};

struct GameplayEventItem {
    uint64_t seq = 0;
    uint64_t created_at_ms = 0;
    std::string id;
    double sim_time = 0.0;
    std::string attrs_json;
};

std::mutex state_mutex;
TelemetryState current_state;
std::map<uint32_t, std::string> substances_map;

std::mutex event_mutex;
std::deque<GameplayEventItem> event_queue;
uint64_t next_event_seq = 1;

std::atomic<bool> thread_running(false);
std::mutex sleep_mutex;
std::condition_variable sleep_cv;
std::thread desktop_thread;
std::thread portal_thread;
std::atomic<uint64_t> last_desktop_ok_ms(0);

char token[128] = "UnknownToken";
char desktop_ip[64] = "127.0.0.1";
int desktop_port = 3001;
char portal_host[128] = "portal.truckers.jp";
int portal_port = 443;
char game_id[32] = "unknown";

uint64_t NowMs() {
    return static_cast<uint64_t>(
        std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now().time_since_epoch())
            .count());
}

void CopySafeStr(char* dst, size_t dstSize, const char* src) {
    if (!dst || dstSize == 0) return;
    if (!src) {
        dst[0] = '\0';
        return;
    }
    std::strncpy(dst, src, dstSize - 1);
    dst[dstSize - 1] = '\0';
}

double FiniteOrZero(double v) {
    return std::isfinite(v) ? v : 0.0;
}

std::string ToLowerAscii(const std::string& input) {
    std::string out = input;
    for (char& ch : out) {
        ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
    }
    return out;
}

bool IsPavedSubstance(const std::string& name) {
    if (name.empty()) return true; // unknown defaults to safe (avoid false positives)
    std::string lower = ToLowerAscii(name);
    return lower.find("asphalt") != std::string::npos ||
           lower.find("concrete") != std::string::npos ||
           lower.find("cobble") != std::string::npos ||
           lower.find("tarmac") != std::string::npos ||
           lower.find("road") != std::string::npos ||
           lower.find("pave") != std::string::npos;
}

void RecomputeWheelOffroadLocked() {
    bool offroad = false;
    for (size_t i = 0; i < kTrackedWheels; ++i) {
        if (!current_state.wheel_on_ground[i]) continue;
        auto it = substances_map.find(current_state.wheel_substance[i]);
        if (it != substances_map.end() && !IsPavedSubstance(it->second)) {
            offroad = true;
            break;
        }
    }
    current_state.wheel_offroad = offroad;
}

void AppendEscapedStrContent(std::string& out, const char* val) {
    if (!val) return;
    for (const unsigned char* p = reinterpret_cast<const unsigned char*>(val); *p; ++p) {
        unsigned char c = *p;
        if (c == '"' || c == '\\') {
            out.push_back('\\');
            out.push_back(static_cast<char>(c));
        } else if (c == '\n') {
            out.append("\\n");
        } else if (c == '\r') {
            out.append("\\r");
        } else if (c == '\t') {
            out.append("\\t");
        } else if (c < 0x20) {
            char buf[8];
            std::snprintf(buf, sizeof(buf), "\\u%04x", c);
            out.append(buf);
        } else {
            out.push_back(static_cast<char>(c));
        }
    }
}

void AppendJsonString(std::string& out, const char* key, const char* val, bool leadingComma = true) {
    if (leadingComma) out.push_back(',');
    out.push_back('"');
    out.append(key);
    out.append("\":\"");
    AppendEscapedStrContent(out, val);
    out.push_back('"');
}

void AppendJsonDouble(std::string& out, const char* key, double val, bool leadingComma = true) {
    char buf[128];
    std::snprintf(buf, sizeof(buf), "%s\"%s\":%.4f", leadingComma ? "," : "", key, FiniteOrZero(val));
    out.append(buf);
}

void AppendJsonInt(std::string& out, const char* key, long long val, bool leadingComma = true) {
    char buf[96];
    std::snprintf(buf, sizeof(buf), "%s\"%s\":%lld", leadingComma ? "," : "", key, val);
    out.append(buf);
}

void AppendJsonBool(std::string& out, const char* key, bool val, bool leadingComma = true) {
    char buf[64];
    std::snprintf(buf, sizeof(buf), "%s\"%s\":%s", leadingComma ? "," : "", key, val ? "true" : "false");
    out.append(buf);
}

std::string SerializeNamedAttributesJson(const scs_named_value_t* attributes) {
    std::string out;
    out.reserve(512);
    out.push_back('{');
    bool first = true;
    for (const scs_named_value_t* cur = attributes; cur && cur->name; ++cur) {
        const bool comma = !first;
        switch (cur->value.type) {
            case SCS_VALUE_TYPE_bool:
                AppendJsonBool(out, cur->name, cur->value.value_bool.value != 0, comma);
                first = false;
                break;
            case SCS_VALUE_TYPE_s32:
                AppendJsonInt(out, cur->name, static_cast<long long>(cur->value.value_s32.value), comma);
                first = false;
                break;
            case SCS_VALUE_TYPE_u32:
                AppendJsonInt(out, cur->name, static_cast<long long>(cur->value.value_u32.value), comma);
                first = false;
                break;
            case SCS_VALUE_TYPE_s64:
                AppendJsonInt(out, cur->name, static_cast<long long>(cur->value.value_s64.value), comma);
                first = false;
                break;
            case SCS_VALUE_TYPE_u64:
                AppendJsonInt(out, cur->name, static_cast<long long>(cur->value.value_u64.value), comma);
                first = false;
                break;
            case SCS_VALUE_TYPE_float:
                AppendJsonDouble(out, cur->name, static_cast<double>(cur->value.value_float.value), comma);
                first = false;
                break;
            case SCS_VALUE_TYPE_double:
                AppendJsonDouble(out, cur->name, cur->value.value_double.value, comma);
                first = false;
                break;
            case SCS_VALUE_TYPE_string:
                AppendJsonString(out, cur->name, cur->value.value_string.value, comma);
                first = false;
                break;
            default:
                break;
        }
    }
    out.push_back('}');
    return out;
}

void LoadConfig() {
#ifdef _WIN32
    char ini_path[MAX_PATH] = {};
    HMODULE hModule = NULL;
    if (GetModuleHandleExA(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            reinterpret_cast<LPCSTR>(&LoadConfig),
            &hModule)) {
        GetModuleFileNameA(hModule, ini_path, MAX_PATH);
        char* ext = std::strrchr(ini_path, '.');
        if (ext) {
            std::strcpy(ext, ".ini");
        }
        GetPrivateProfileStringA("Settings", "Token", "UnknownToken", token, sizeof(token), ini_path);
        GetPrivateProfileStringA("Settings", "ServerIP", "127.0.0.1", desktop_ip, sizeof(desktop_ip), ini_path);
        desktop_port = GetPrivateProfileIntA("Settings", "ServerPort", 3001, ini_path);

        char explicit_portal_host[128] = {};
        GetPrivateProfileStringA("Settings", "PortalHost", "", explicit_portal_host, sizeof(explicit_portal_host), ini_path);
        const int explicit_portal_port = GetPrivateProfileIntA("Settings", "PortalPort", 0, ini_path);

        if (explicit_portal_host[0] != '\0') {
            CopySafeStr(portal_host, sizeof(portal_host), explicit_portal_host);
            portal_port = explicit_portal_port > 0 ? explicit_portal_port : 443;
        } else if (std::strcmp(desktop_ip, "127.0.0.1") != 0 && std::strcmp(desktop_ip, "localhost") != 0) {
            // Legacy DLL-only INI compatibility: ServerIP pointed to portal host
            CopySafeStr(portal_host, sizeof(portal_host), desktop_ip);
            portal_port = desktop_port > 0 ? desktop_port : 443;
            CopySafeStr(desktop_ip, sizeof(desktop_ip), "127.0.0.1");
            desktop_port = 3001;
        } else if (explicit_portal_port > 0) {
            portal_port = explicit_portal_port;
        }
    }
#endif
}

std::string BuildDesktopJson(
    const TelemetryState& copy,
    const std::vector<GameplayEventItem>& pendingEvents) {
    std::string out;
    out.reserve(4096);
    out.push_back('{');

    AppendJsonInt(out, "sdk_version", 2, false);
    AppendJsonString(out, "token", token);
    AppendJsonString(out, "game", game_id);

    AppendJsonBool(out, "paused", copy.paused);
    AppendJsonDouble(out, "simulation_time", copy.simulation_time);
    AppendJsonDouble(out, "paused_simulation_time", copy.paused_simulation_time);
    AppendJsonDouble(out, "local_scale", copy.local_scale);
    AppendJsonInt(out, "game_time", static_cast<long long>(copy.game_time));
    AppendJsonInt(out, "multiplayer_time_offset", static_cast<long long>(copy.multiplayer_time_offset));
    AppendJsonInt(out, "rest_stop", static_cast<long long>(copy.rest_stop));
    AppendJsonInt(out, "mandatory_break", static_cast<long long>(copy.mandatory_break));

    AppendJsonDouble(out, "x", copy.x);
    AppendJsonDouble(out, "y", copy.y);
    AppendJsonDouble(out, "z", copy.z);
    AppendJsonDouble(out, "heading", copy.heading);
    AppendJsonDouble(out, "pitch", copy.pitch);
    AppendJsonDouble(out, "roll", copy.roll);

    AppendJsonDouble(out, "accel_x", copy.accel_x);
    AppendJsonDouble(out, "accel_y", copy.accel_y);
    AppendJsonDouble(out, "accel_z", copy.accel_z);
    AppendJsonDouble(out, "g_lateral", copy.g_lateral);
    AppendJsonDouble(out, "g_vertical", copy.g_vertical);
    AppendJsonDouble(out, "g_longitudinal", copy.g_longitudinal);
    AppendJsonDouble(out, "g_jerk", copy.g_jerk);

    AppendJsonDouble(out, "vel_linear_x", copy.vel_linear_x);
    AppendJsonDouble(out, "vel_linear_y", copy.vel_linear_y);
    AppendJsonDouble(out, "vel_linear_z", copy.vel_linear_z);
    AppendJsonDouble(out, "vel_angular_x", copy.vel_angular_x);
    AppendJsonDouble(out, "vel_angular_y", copy.vel_angular_y);
    AppendJsonDouble(out, "vel_angular_z", copy.vel_angular_z);

    AppendJsonDouble(out, "cabin_offset_x", copy.cabin_offset_x);
    AppendJsonDouble(out, "cabin_offset_y", copy.cabin_offset_y);
    AppendJsonDouble(out, "cabin_offset_z", copy.cabin_offset_z);
    AppendJsonDouble(out, "cabin_angular_vel_x", copy.cabin_angular_vel_x);
    AppendJsonDouble(out, "cabin_angular_vel_y", copy.cabin_angular_vel_y);
    AppendJsonDouble(out, "cabin_angular_vel_z", copy.cabin_angular_vel_z);

    AppendJsonDouble(out, "speed", copy.speed);
    AppendJsonDouble(out, "engine_rpm", copy.engine_rpm);
    AppendJsonDouble(out, "rpm_limit", copy.rpm_limit);
    AppendJsonInt(out, "engine_gear", copy.engine_gear);
    AppendJsonInt(out, "gear", copy.gear);
    AppendJsonDouble(out, "cruise_control", copy.cruise_control);

    AppendJsonDouble(out, "input_steering", copy.input_steering);
    AppendJsonDouble(out, "input_throttle", copy.input_throttle);
    AppendJsonDouble(out, "input_brake", copy.input_brake);
    AppendJsonDouble(out, "input_clutch", copy.input_clutch);
    AppendJsonDouble(out, "effective_steering", copy.effective_steering);
    AppendJsonDouble(out, "effective_throttle", copy.effective_throttle);
    AppendJsonDouble(out, "brake", copy.brake);
    AppendJsonDouble(out, "effective_clutch", copy.effective_clutch);

    AppendJsonBool(out, "parking_brake", copy.parking_brake);
    AppendJsonBool(out, "motor_brake", copy.motor_brake);
    AppendJsonDouble(out, "retarder", copy.retarder);
    AppendJsonDouble(out, "brake_air_pressure", copy.brake_air_pressure);
    AppendJsonBool(out, "brake_air_warning", copy.brake_air_warning);
    AppendJsonBool(out, "brake_air_emergency", copy.brake_air_emergency);
    AppendJsonDouble(out, "brake_temperature", copy.brake_temperature);

    AppendJsonDouble(out, "odometer", copy.odometer);
    AppendJsonDouble(out, "fuel", copy.fuel);
    AppendJsonDouble(out, "fuel_capacity", copy.fuel_capacity);
    AppendJsonBool(out, "fuel_warning", copy.fuel_warning);
    AppendJsonDouble(out, "fuel_avg_consumption", copy.fuel_avg_consumption);
    AppendJsonDouble(out, "fuel_range", copy.fuel_range);
    AppendJsonDouble(out, "adblue", copy.adblue);
    AppendJsonBool(out, "adblue_warning", copy.adblue_warning);

    AppendJsonBool(out, "oil_pressure_warning", copy.oil_pressure_warning);
    AppendJsonBool(out, "water_temp_warning", copy.water_temp_warning);
    AppendJsonBool(out, "battery_voltage_warning", copy.battery_voltage_warning);
    AppendJsonBool(out, "electric_enabled", copy.electric_enabled);
    AppendJsonBool(out, "engine_enabled", copy.engine_enabled);

    AppendJsonBool(out, "lblinker", copy.lblinker);
    AppendJsonBool(out, "rblinker", copy.rblinker);
    AppendJsonBool(out, "hazard", copy.hazard);
    AppendJsonBool(out, "parking_light", copy.parking_light);
    AppendJsonBool(out, "low_beam", copy.low_beam);
    AppendJsonBool(out, "high_beam", copy.high_beam);
    AppendJsonBool(out, "aux_front", copy.aux_front);
    AppendJsonBool(out, "aux_roof", copy.aux_roof);
    AppendJsonBool(out, "beacon", copy.beacon);
    AppendJsonBool(out, "brake_light", copy.brake_light);
    AppendJsonBool(out, "reverse_light", copy.reverse_light);
    AppendJsonBool(out, "wipers", copy.wipers);
    AppendJsonBool(out, "differential_lock", copy.differential_lock);
    AppendJsonBool(out, "lift_axle", copy.lift_axle);
    AppendJsonBool(out, "trailer_lift_axle", copy.trailer_lift_axle);
    AppendJsonBool(out, "wheel_offroad", copy.wheel_offroad);

    AppendJsonDouble(out, "wear_engine", copy.wear_engine);
    AppendJsonDouble(out, "wear_transmission", copy.wear_transmission);
    AppendJsonDouble(out, "wear_cabin", copy.wear_cabin);
    AppendJsonDouble(out, "wear_chassis", copy.wear_chassis);
    AppendJsonDouble(out, "wear_wheels", copy.wear_wheels);

    AppendJsonDouble(out, "nav_distance", copy.nav_distance);
    AppendJsonDouble(out, "nav_time", copy.nav_time);
    AppendJsonDouble(out, "speed_limit", copy.speed_limit);
    AppendJsonDouble(out, "cargo_damage", copy.cargo_damage);

    // Top-level trailer.0 fields for backward compatibility
    const TrailerState& t0 = copy.trailers[0];
    AppendJsonBool(out, "trailer_connected", t0.connected);
    AppendJsonDouble(out, "trailer_x", t0.x);
    AppendJsonDouble(out, "trailer_y", t0.y);
    AppendJsonDouble(out, "trailer_z", t0.z);
    AppendJsonDouble(out, "trailer_heading", t0.heading);
    AppendJsonDouble(out, "trailer_pitch", t0.pitch);
    AppendJsonDouble(out, "trailer_roll", t0.roll);
    AppendJsonString(out, "trailer_body_type", t0.body_type);
    AppendJsonString(out, "trailer_chain_type", t0.chain_type);

    // Multi-trailer array (0..9)
    out.append(",\"trailers\":[");
    bool firstTrailer = true;
    for (size_t i = 0; i < kMaxTrailers; ++i) {
        const TrailerState& tr = copy.trailers[i];
        if (!tr.connected && i > 0) continue;
        if (!tr.connected && i == 0) continue;
        if (!firstTrailer) out.push_back(',');
        firstTrailer = false;
        out.push_back('{');
        AppendJsonInt(out, "index", static_cast<long long>(i), false);
        AppendJsonBool(out, "connected", tr.connected);
        AppendJsonDouble(out, "x", tr.x);
        AppendJsonDouble(out, "y", tr.z);
        AppendJsonDouble(out, "altitude", tr.y);
        AppendJsonDouble(out, "heading", tr.heading);
        AppendJsonDouble(out, "pitch", tr.pitch);
        AppendJsonDouble(out, "roll", tr.roll);
        AppendJsonDouble(out, "cargo_damage", tr.cargo_damage);
        AppendJsonDouble(out, "wear_body", tr.wear_body);
        AppendJsonDouble(out, "wear_chassis", tr.wear_chassis);
        AppendJsonDouble(out, "wear_wheels", tr.wear_wheels);
        AppendJsonString(out, "bodyType", tr.body_type);
        AppendJsonString(out, "chainType", tr.chain_type);
        out.push_back('}');
    }
    out.push_back(']');

    AppendJsonString(out, "truck_brand_id", copy.truck_brand_id);
    AppendJsonString(out, "truck_brand", copy.truck_brand);
    AppendJsonString(out, "truck_id", copy.truck_id);
    AppendJsonString(out, "truck_name", copy.truck_name);
    AppendJsonString(out, "license_plate", copy.license_plate);
    AppendJsonString(out, "license_plate_country", copy.license_plate_country);
    AppendJsonInt(out, "retarder_steps", static_cast<long long>(copy.retarder_steps));

    AppendJsonString(out, "cargo_id", copy.cargo_id);
    AppendJsonString(out, "cargo_name", copy.cargo_name);
    AppendJsonDouble(out, "cargo_mass", copy.cargo_mass);
    AppendJsonString(out, "source_city_id", copy.source_city_id);
    AppendJsonString(out, "source_city", copy.source_city);
    AppendJsonString(out, "destination_city_id", copy.destination_city_id);
    AppendJsonString(out, "destination_city", copy.destination_city);
    AppendJsonString(out, "source_company_id", copy.source_company_id);
    AppendJsonString(out, "source_company", copy.source_company);
    AppendJsonString(out, "destination_company_id", copy.destination_company_id);
    AppendJsonString(out, "destination_company", copy.destination_company);
    AppendJsonInt(out, "planned_distance_km", copy.planned_distance_km);
    AppendJsonInt(out, "job_income", static_cast<long long>(copy.job_income));
    AppendJsonInt(out, "delivery_time", static_cast<long long>(copy.delivery_time));
    AppendJsonBool(out, "cargo_loaded", copy.cargo_loaded);
    AppendJsonString(out, "job_market", copy.job_market);
    AppendJsonBool(out, "is_special_job", copy.is_special_job);

    out.append(",\"events\":[");
    for (size_t i = 0; i < pendingEvents.size(); ++i) {
        const GameplayEventItem& ev = pendingEvents[i];
        if (i > 0) out.push_back(',');
        out.push_back('{');
        AppendJsonInt(out, "seq", static_cast<long long>(ev.seq), false);
        AppendJsonString(out, "id", ev.id.c_str());
        AppendJsonDouble(out, "sim_time", ev.sim_time);
        out.append(",\"attributes\":");
        out.append(ev.attrs_json.empty() ? "{}" : ev.attrs_json);
        out.push_back('}');
    }
    out.push_back(']');

    out.push_back('}');
    return out;
}

std::string BuildPortalFallbackJson(const TelemetryState& copy) {
    std::string out;
    out.reserve(1024);
    out.push_back('{');
    AppendJsonString(out, "token", token, false);
    AppendJsonString(out, "game", game_id);
    AppendJsonDouble(out, "x", copy.x);
    AppendJsonDouble(out, "y", copy.y);
    AppendJsonDouble(out, "z", copy.z);
    AppendJsonDouble(out, "heading", copy.heading);
    AppendJsonDouble(out, "pitch", copy.pitch);
    AppendJsonDouble(out, "roll", copy.roll);
    AppendJsonDouble(out, "speed", copy.speed);
    AppendJsonDouble(out, "engine_rpm", copy.engine_rpm);
    AppendJsonDouble(out, "odometer", copy.odometer);
    AppendJsonDouble(out, "fuel", copy.fuel);
    AppendJsonDouble(out, "cruise_control", copy.cruise_control);
    AppendJsonDouble(out, "brake", copy.brake);
    AppendJsonDouble(out, "retarder", copy.retarder);
    AppendJsonInt(out, "gear", copy.gear);
    AppendJsonBool(out, "lblinker", copy.lblinker);
    AppendJsonBool(out, "rblinker", copy.rblinker);
    AppendJsonBool(out, "hazard", copy.hazard);
    AppendJsonBool(out, "beacon", copy.beacon);
    AppendJsonBool(out, "brake_light", copy.brake_light);
    AppendJsonBool(out, "low_beam", copy.low_beam);
    AppendJsonBool(out, "high_beam", copy.high_beam);
    AppendJsonDouble(out, "nav_distance", copy.nav_distance);
    AppendJsonDouble(out, "speed_limit", copy.speed_limit);
    AppendJsonDouble(out, "cargo_damage", copy.cargo_damage);
    AppendJsonBool(out, "trailer_connected", copy.trailers[0].connected);
    AppendJsonDouble(out, "trailer_x", copy.trailers[0].x);
    AppendJsonDouble(out, "trailer_y", copy.trailers[0].y);
    AppendJsonDouble(out, "trailer_z", copy.trailers[0].z);
    AppendJsonDouble(out, "trailer_heading", copy.trailers[0].heading);
    AppendJsonString(out, "truck_brand", copy.truck_brand);
    AppendJsonString(out, "truck_name", copy.truck_name);
    AppendJsonString(out, "license_plate", copy.license_plate);
    AppendJsonString(out, "cargo_name", copy.cargo_name);
    AppendJsonDouble(out, "cargo_mass", copy.cargo_mass);
    AppendJsonString(out, "source_city", copy.source_city);
    AppendJsonString(out, "destination_city", copy.destination_city);
    out.push_back('}');
    return out;
}

void WaitInterruptible(uint32_t ms) {
    std::unique_lock<std::mutex> lock(sleep_mutex);
    sleep_cv.wait_for(lock, std::chrono::milliseconds(ms), []() { return !thread_running.load(); });
}

void DesktopSenderLoop() {
#ifdef _WIN32
    HINTERNET hInternet = InternetOpenA("ENJOYTRUCKERS-Telemetry/2.0", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (!hInternet) return;

    DWORD timeoutMs = 200;
    InternetSetOptionA(hInternet, INTERNET_OPTION_CONNECT_TIMEOUT, &timeoutMs, sizeof(timeoutMs));
    InternetSetOptionA(hInternet, INTERNET_OPTION_SEND_TIMEOUT, &timeoutMs, sizeof(timeoutMs));
    InternetSetOptionA(hInternet, INTERNET_OPTION_RECEIVE_TIMEOUT, &timeoutMs, sizeof(timeoutMs));

    HINTERNET hConnectDesktop = InternetConnectA(
        hInternet,
        desktop_ip,
        static_cast<INTERNET_PORT>(desktop_port),
        NULL,
        NULL,
        INTERNET_SERVICE_HTTP,
        0,
        0);

    const DWORD flags = INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE;
    const char* headers = "Content-Type: application/json\r\nConnection: keep-alive\r\n";

    while (thread_running.load()) {
        TelemetryState copy;
        {
            std::lock_guard<std::mutex> lock(state_mutex);
            copy = current_state;
        }

        std::vector<GameplayEventItem> pendingEvents;
        const uint64_t now = NowMs();
        {
            std::lock_guard<std::mutex> elock(event_mutex);
            while (!event_queue.empty() && (now - event_queue.front().created_at_ms > kEventTtlMs)) {
                event_queue.pop_front();
            }
            const size_t batchCount = std::min<size_t>(event_queue.size(), 16);
            for (size_t i = 0; i < batchCount; ++i) {
                pendingEvents.push_back(event_queue[i]);
            }
        }

        std::string payload = BuildDesktopJson(copy, pendingEvents);
        bool deliveredOk = false;

        if (!hConnectDesktop) {
            hConnectDesktop = InternetConnectA(
                hInternet,
                desktop_ip,
                static_cast<INTERNET_PORT>(desktop_port),
                NULL,
                NULL,
                INTERNET_SERVICE_HTTP,
                0,
                0);
        }

        if (hConnectDesktop) {
            HINTERNET hReq = HttpOpenRequestA(hConnectDesktop, "POST", "/", NULL, NULL, NULL, flags, 0);
            if (hReq) {
                if (HttpSendRequestA(
                        hReq,
                        headers,
                        static_cast<DWORD>(std::strlen(headers)),
                        const_cast<char*>(payload.c_str()),
                        static_cast<DWORD>(payload.size()))) {
                    DWORD statusCode = 0;
                    DWORD statusSize = sizeof(statusCode);
                    if (HttpQueryInfoA(
                            hReq,
                            HTTP_QUERY_STATUS_CODE | HTTP_QUERY_FLAG_NUMBER,
                            &statusCode,
                            &statusSize,
                            NULL) &&
                        statusCode >= 200 &&
                        statusCode < 300) {
                        deliveredOk = true;
                    }
                }
                InternetCloseHandle(hReq);
            }
        }

        if (deliveredOk) {
            last_desktop_ok_ms.store(NowMs());
            if (!pendingEvents.empty()) {
                const uint64_t maxAckSeq = pendingEvents.back().seq;
                std::lock_guard<std::mutex> elock(event_mutex);
                while (!event_queue.empty() && event_queue.front().seq <= maxAckSeq) {
                    event_queue.pop_front();
                }
            }
        }

        WaitInterruptible(50); // 20Hz local telemetry & G-sensor stream
    }

    if (hConnectDesktop) InternetCloseHandle(hConnectDesktop);
    InternetCloseHandle(hInternet);
#else
    while (thread_running.load()) {
        TelemetryState copy;
        {
            std::lock_guard<std::mutex> lock(state_mutex);
            copy = current_state;
        }
        std::vector<GameplayEventItem> events;
        (void)BuildDesktopJson(copy, events);
        WaitInterruptible(50);
    }
#endif
}

void PortalFallbackLoop() {
#ifdef _WIN32
    HINTERNET hInternet = InternetOpenA("ENJOYTRUCKERS-Fallback/2.0", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (!hInternet) return;

    DWORD timeoutMs = 2000;
    InternetSetOptionA(hInternet, INTERNET_OPTION_CONNECT_TIMEOUT, &timeoutMs, sizeof(timeoutMs));
    InternetSetOptionA(hInternet, INTERNET_OPTION_SEND_TIMEOUT, &timeoutMs, sizeof(timeoutMs));
    InternetSetOptionA(hInternet, INTERNET_OPTION_RECEIVE_TIMEOUT, &timeoutMs, sizeof(timeoutMs));

    HINTERNET hConnectPortal = NULL;
    const bool useTls = (portal_port == 443);
    const DWORD flags = INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE | (useTls ? INTERNET_FLAG_SECURE : 0);
    const char* headers = "Content-Type: application/json\r\n";

    while (thread_running.load()) {
        WaitInterruptible(3000);
        if (!thread_running.load()) break;

        const uint64_t now = NowMs();
        const uint64_t lastOk = last_desktop_ok_ms.load();
        if (lastOk > 0 && (now - lastOk) <= kDesktopStaleThresholdMs) {
            continue;
        }
        if (std::strcmp(token, "UnknownToken") == 0 || token[0] == '\0') {
            continue;
        }

        if (!hConnectPortal) {
            hConnectPortal = InternetConnectA(
                hInternet,
                portal_host,
                static_cast<INTERNET_PORT>(portal_port),
                NULL,
                NULL,
                INTERNET_SERVICE_HTTP,
                0,
                0);
        }
        if (!hConnectPortal) continue;

        TelemetryState copy;
        {
            std::lock_guard<std::mutex> lock(state_mutex);
            copy = current_state;
        }
        std::string payload = BuildPortalFallbackJson(copy);
        HINTERNET hReq = HttpOpenRequestA(hConnectPortal, "POST", "/api/telemetry/update", NULL, NULL, NULL, flags, 0);
        if (hReq) {
            HttpSendRequestA(
                hReq,
                headers,
                static_cast<DWORD>(std::strlen(headers)),
                const_cast<char*>(payload.c_str()),
                static_cast<DWORD>(payload.size()));
            InternetCloseHandle(hReq);
        }
    }

    if (hConnectPortal) InternetCloseHandle(hConnectPortal);
    InternetCloseHandle(hInternet);
#else
    while (thread_running.load()) {
        WaitInterruptible(3000);
        if (!thread_running.load()) break;
        TelemetryState copy;
        {
            std::lock_guard<std::mutex> lock(state_mutex);
            copy = current_state;
        }
        (void)BuildPortalFallbackJson(copy);
    }
#endif
}

// Channel callbacks
SCSAPI_VOID telemetry_frame_start(const scs_event_t event, const void* const event_info, const scs_context_t context) {
    UNUSED(event);
    UNUSED(context);
    const auto* info = static_cast<const scs_telemetry_frame_start_t*>(event_info);
    if (!info) return;

    std::lock_guard<std::mutex> lock(state_mutex);
    current_state.render_time = static_cast<double>(info->render_time) / 1000000.0;
    current_state.simulation_time = static_cast<double>(info->simulation_time) / 1000000.0;
    current_state.paused_simulation_time = static_cast<double>(info->paused_simulation_time) / 1000000.0;
    if (info->flags & SCS_TELEMETRY_FRAME_START_FLAG_timer_restart) {
        current_state.prev_accel_sim_time = -1.0;
    }
}

SCSAPI_VOID telemetry_paused_or_started(const scs_event_t event, const void* const event_info, const scs_context_t context) {
    UNUSED(event_info);
    UNUSED(context);
    std::lock_guard<std::mutex> lock(state_mutex);
    if (event == SCS_TELEMETRY_EVENT_paused) {
        current_state.paused = true;
        current_state.last_paused_ms = NowMs();
        current_state.accel_x = 0.0f;
        current_state.accel_y = 0.0f;
        current_state.accel_z = 0.0f;
        current_state.g_lateral = 0.0;
        current_state.g_vertical = 0.0;
        current_state.g_longitudinal = 0.0;
        current_state.g_jerk = 0.0;
        current_state.prev_accel_sim_time = -1.0;
    } else if (event == SCS_TELEMETRY_EVENT_started) {
        current_state.paused = false;
        current_state.last_started_ms = NowMs();
    }
}

SCSAPI_VOID telemetry_store_dplacement(const scs_string_t name, const scs_u32_t index, const scs_value_t* const value, const scs_context_t context) {
    UNUSED(name);
    UNUSED(index);
    if (!value || value->type != SCS_VALUE_TYPE_dplacement) return;

    const intptr_t slot = reinterpret_cast<intptr_t>(context);
    std::lock_guard<std::mutex> lock(state_mutex);

    if (slot == -1) {
        current_state.x = value->value_dplacement.position.x;
        current_state.y = value->value_dplacement.position.y;
        current_state.z = value->value_dplacement.position.z;
        current_state.heading = static_cast<float>(value->value_dplacement.orientation.heading * 360.0);
        current_state.pitch = static_cast<float>(value->value_dplacement.orientation.pitch * 360.0);
        current_state.roll = static_cast<float>(value->value_dplacement.orientation.roll * 360.0);
    } else if (slot >= 0 && slot < static_cast<intptr_t>(kMaxTrailers)) {
        TrailerState& tr = current_state.trailers[static_cast<size_t>(slot)];
        tr.x = value->value_dplacement.position.x;
        tr.y = value->value_dplacement.position.y;
        tr.z = value->value_dplacement.position.z;
        tr.heading = static_cast<float>(value->value_dplacement.orientation.heading * 360.0);
        tr.pitch = static_cast<float>(value->value_dplacement.orientation.pitch * 360.0);
        tr.roll = static_cast<float>(value->value_dplacement.orientation.roll * 360.0);
    }
}

SCSAPI_VOID telemetry_store_fvector(const scs_string_t name, const scs_u32_t index, const scs_value_t* const value, const scs_context_t context) {
    UNUSED(index);
    UNUSED(context);
    if (!value || value->type != SCS_VALUE_TYPE_fvector) return;

    std::lock_guard<std::mutex> lock(state_mutex);
    const auto& v = value->value_fvector;

    if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_local_linear_acceleration) == 0) {
        current_state.accel_x = v.x;
        current_state.accel_y = v.y;
        current_state.accel_z = v.z;

        const double gx = static_cast<double>(v.x) / kGravityMs2;
        const double gy = static_cast<double>(v.y) / kGravityMs2;
        const double gz = -static_cast<double>(v.z) / kGravityMs2; // -Z is forward in SCS

        if (current_state.prev_accel_sim_time >= 0.0 && current_state.simulation_time > current_state.prev_accel_sim_time) {
            const double dt = current_state.simulation_time - current_state.prev_accel_sim_time;
            if (dt > 0.001 && dt < 1.0) {
                const double dgx = (gx - current_state.prev_gx) / dt;
                const double dgy = (gy - current_state.prev_gy) / dt;
                const double dgz = (gz - current_state.prev_gz) / dt;
                current_state.g_jerk = std::sqrt(dgx * dgx + dgy * dgy + dgz * dgz);
            }
        }
        current_state.g_lateral = gx;
        current_state.g_vertical = gy;
        current_state.g_longitudinal = gz;
        current_state.prev_gx = gx;
        current_state.prev_gy = gy;
        current_state.prev_gz = gz;
        current_state.prev_accel_sim_time = current_state.simulation_time;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_local_linear_velocity) == 0) {
        current_state.vel_linear_x = v.x;
        current_state.vel_linear_y = v.y;
        current_state.vel_linear_z = v.z;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_local_angular_velocity) == 0) {
        current_state.vel_angular_x = v.x;
        current_state.vel_angular_y = v.y;
        current_state.vel_angular_z = v.z;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_cabin_angular_velocity) == 0) {
        current_state.cabin_angular_vel_x = v.x;
        current_state.cabin_angular_vel_y = v.y;
        current_state.cabin_angular_vel_z = v.z;
    }
}

SCSAPI_VOID telemetry_store_fplacement(const scs_string_t name, const scs_u32_t index, const scs_value_t* const value, const scs_context_t context) {
    UNUSED(name);
    UNUSED(index);
    UNUSED(context);
    if (!value || value->type != SCS_VALUE_TYPE_fplacement) return;

    std::lock_guard<std::mutex> lock(state_mutex);
    current_state.cabin_offset_x = value->value_fplacement.position.x;
    current_state.cabin_offset_y = value->value_fplacement.position.y;
    current_state.cabin_offset_z = value->value_fplacement.position.z;
}

SCSAPI_VOID telemetry_store_float(const scs_string_t name, const scs_u32_t index, const scs_value_t* const value, const scs_context_t context) {
    if (!value || value->type != SCS_VALUE_TYPE_float) return;
    const float f = value->value_float.value;
    const intptr_t slot = reinterpret_cast<intptr_t>(context);

    std::lock_guard<std::mutex> lock(state_mutex);

    if (slot >= 0 && slot < static_cast<intptr_t>(kMaxTrailers)) {
        TrailerState& tr = current_state.trailers[static_cast<size_t>(slot)];
        if (std::strstr(name, ".cargo.damage") != nullptr) {
            tr.cargo_damage = f;
        } else if (std::strstr(name, ".wear.body") != nullptr) {
            tr.wear_body = f;
        } else if (std::strstr(name, ".wear.chassis") != nullptr) {
            tr.wear_chassis = f;
        } else if (std::strstr(name, ".wear.wheels") != nullptr) {
            tr.wear_wheels = f;
        }
        return;
    }

    if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_speed) == 0) {
        current_state.speed = f * 3.6f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_engine_rpm) == 0) {
        current_state.engine_rpm = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_odometer) == 0) {
        current_state.odometer = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_fuel) == 0) {
        current_state.fuel = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_fuel_average_consumption) == 0) {
        current_state.fuel_avg_consumption = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_fuel_range) == 0) {
        current_state.fuel_range = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_adblue) == 0) {
        current_state.adblue = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_cruise_control) == 0) {
        current_state.cruise_control = f * 3.6f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_input_steering) == 0) {
        current_state.input_steering = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_input_throttle) == 0) {
        current_state.input_throttle = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_input_brake) == 0) {
        current_state.input_brake = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_input_clutch) == 0) {
        current_state.input_clutch = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_effective_steering) == 0) {
        current_state.effective_steering = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_effective_throttle) == 0) {
        current_state.effective_throttle = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_effective_brake) == 0) {
        current_state.brake = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_effective_clutch) == 0) {
        current_state.effective_clutch = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_brake_air_pressure) == 0) {
        current_state.brake_air_pressure = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_brake_temperature) == 0) {
        current_state.brake_temperature = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_wear_engine) == 0) {
        current_state.wear_engine = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_wear_transmission) == 0) {
        current_state.wear_transmission = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_wear_cabin) == 0) {
        current_state.wear_cabin = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_wear_chassis) == 0) {
        current_state.wear_chassis = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_wear_wheels) == 0) {
        current_state.wear_wheels = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_navigation_distance) == 0) {
        current_state.nav_distance = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_navigation_time) == 0) {
        current_state.nav_time = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_navigation_speed_limit) == 0) {
        current_state.speed_limit = f > 0.0f ? f * 3.6f : 0.0f;
    } else if (std::strcmp(name, SCS_TELEMETRY_JOB_CHANNEL_cargo_damage) == 0) {
        current_state.cargo_damage = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_CHANNEL_local_scale) == 0) {
        current_state.local_scale = f;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_wheel_susp_deflection) == 0 && index < kTrackedWheels) {
        current_state.wheel_susp_deflection[index] = f;
    }
}

SCSAPI_VOID telemetry_store_u32(const scs_string_t name, const scs_u32_t index, const scs_value_t* const value, const scs_context_t context) {
    UNUSED(context);
    if (!value || value->type != SCS_VALUE_TYPE_u32) return;
    const uint32_t u = value->value_u32.value;

    std::lock_guard<std::mutex> lock(state_mutex);
    if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_retarder_level) == 0) {
        current_state.retarder = static_cast<float>(u);
    } else if (std::strcmp(name, SCS_TELEMETRY_CHANNEL_game_time) == 0) {
        current_state.game_time = u;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_wheel_substance) == 0 && index < kTrackedWheels) {
        current_state.wheel_substance[index] = u;
        RecomputeWheelOffroadLocked();
    }
}

SCSAPI_VOID telemetry_store_s32(const scs_string_t name, const scs_u32_t index, const scs_value_t* const value, const scs_context_t context) {
    UNUSED(index);
    UNUSED(context);
    if (!value || value->type != SCS_VALUE_TYPE_s32) return;
    const int32_t s = value->value_s32.value;

    std::lock_guard<std::mutex> lock(state_mutex);
    if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_displayed_gear) == 0) {
        current_state.gear = s;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_engine_gear) == 0) {
        current_state.engine_gear = s;
    } else if (std::strcmp(name, SCS_TELEMETRY_CHANNEL_multiplayer_time_offset) == 0) {
        current_state.multiplayer_time_offset = s;
    } else if (std::strcmp(name, SCS_TELEMETRY_CHANNEL_next_rest_stop) == 0) {
        current_state.rest_stop = s;
    } else if (std::strcmp(name, SCS_TELEMETRY_CHANNEL_next_mandatory_break) == 0) {
        current_state.mandatory_break = s;
    }
}

SCSAPI_VOID telemetry_store_bool(const scs_string_t name, const scs_u32_t index, const scs_value_t* const value, const scs_context_t context) {
    if (!value || value->type != SCS_VALUE_TYPE_bool) return;
    const bool b = (value->value_bool.value != 0);
    const intptr_t slot = reinterpret_cast<intptr_t>(context);

    std::lock_guard<std::mutex> lock(state_mutex);

    if (slot >= 0 && slot < static_cast<intptr_t>(kMaxTrailers)) {
        TrailerState& tr = current_state.trailers[static_cast<size_t>(slot)];
        tr.connected = b;
        if (!b) {
            tr.x = 0.0;
            tr.y = 0.0;
            tr.z = 0.0;
            tr.heading = 0.0f;
            tr.pitch = 0.0f;
            tr.roll = 0.0f;
            tr.cargo_damage = 0.0f;
            tr.wear_body = 0.0f;
            tr.wear_chassis = 0.0f;
            tr.wear_wheels = 0.0f;
        }
        return;
    }

    if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_lblinker) == 0) {
        current_state.lblinker = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_rblinker) == 0) {
        current_state.rblinker = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_hazard_warning) == 0) {
        current_state.hazard = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_light_parking) == 0) {
        current_state.parking_light = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_light_low_beam) == 0) {
        current_state.low_beam = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_light_high_beam) == 0) {
        current_state.high_beam = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_light_aux_front) == 0) {
        current_state.aux_front = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_light_aux_roof) == 0) {
        current_state.aux_roof = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_light_beacon) == 0) {
        current_state.beacon = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_light_brake) == 0) {
        current_state.brake_light = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_light_reverse) == 0) {
        current_state.reverse_light = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_wipers) == 0) {
        current_state.wipers = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_parking_brake) == 0) {
        current_state.parking_brake = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_motor_brake) == 0) {
        current_state.motor_brake = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_brake_air_pressure_warning) == 0) {
        current_state.brake_air_warning = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_brake_air_pressure_emergency) == 0) {
        current_state.brake_air_emergency = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_fuel_warning) == 0) {
        current_state.fuel_warning = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_adblue_warning) == 0) {
        current_state.adblue_warning = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_oil_pressure_warning) == 0) {
        current_state.oil_pressure_warning = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_water_temperature_warning) == 0) {
        current_state.water_temp_warning = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_battery_voltage_warning) == 0) {
        current_state.battery_voltage_warning = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_electric_enabled) == 0) {
        current_state.electric_enabled = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_engine_enabled) == 0) {
        current_state.engine_enabled = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_differential_lock) == 0) {
        current_state.differential_lock = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_lift_axle) == 0) {
        current_state.lift_axle = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_trailer_lift_axle) == 0) {
        current_state.trailer_lift_axle = b;
    } else if (std::strcmp(name, SCS_TELEMETRY_TRUCK_CHANNEL_wheel_on_ground) == 0 && index < kTrackedWheels) {
        current_state.wheel_on_ground[index] = b;
        RecomputeWheelOffroadLocked();
    }
}

SCSAPI_VOID telemetry_configuration(const scs_event_t event, const void* const event_info, const scs_context_t context) {
    UNUSED(event);
    UNUSED(context);
    const auto* info = static_cast<const scs_telemetry_configuration_t*>(event_info);
    if (!info || !info->id) return;

    std::lock_guard<std::mutex> lock(state_mutex);

    if (std::strcmp(info->id, SCS_TELEMETRY_CONFIG_substances) == 0) {
        for (const scs_named_value_t* cur = info->attributes; cur && cur->name; ++cur) {
            if (cur->value.type == SCS_VALUE_TYPE_string && cur->value.value_string.value) {
                substances_map[cur->index] = cur->value.value_string.value;
            }
        }
        RecomputeWheelOffroadLocked();
        return;
    }

    if (std::strcmp(info->id, SCS_TELEMETRY_CONFIG_truck) == 0) {
        current_state.truck_brand_id[0] = '\0';
        current_state.truck_brand[0] = '\0';
        current_state.truck_id[0] = '\0';
        current_state.truck_name[0] = '\0';
        current_state.license_plate[0] = '\0';
        current_state.license_plate_country[0] = '\0';
        current_state.retarder_steps = 0;

        for (const scs_named_value_t* cur = info->attributes; cur && cur->name; ++cur) {
            if (cur->value.type == SCS_VALUE_TYPE_string) {
                if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_brand_id) == 0) {
                    CopySafeStr(current_state.truck_brand_id, sizeof(current_state.truck_brand_id), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_brand) == 0) {
                    CopySafeStr(current_state.truck_brand, sizeof(current_state.truck_brand), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_id) == 0) {
                    CopySafeStr(current_state.truck_id, sizeof(current_state.truck_id), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_name) == 0) {
                    CopySafeStr(current_state.truck_name, sizeof(current_state.truck_name), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_license_plate) == 0) {
                    CopySafeStr(current_state.license_plate, sizeof(current_state.license_plate), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_license_plate_country) == 0) {
                    CopySafeStr(current_state.license_plate_country, sizeof(current_state.license_plate_country), cur->value.value_string.value);
                }
            } else if (cur->value.type == SCS_VALUE_TYPE_float) {
                if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_rpm_limit) == 0) {
                    current_state.rpm_limit = cur->value.value_float.value;
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_fuel_capacity) == 0) {
                    current_state.fuel_capacity = cur->value.value_float.value;
                }
            } else if (cur->value.type == SCS_VALUE_TYPE_u32) {
                if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_retarder_step_count) == 0) {
                    current_state.retarder_steps = cur->value.value_u32.value;
                }
            }
        }
        return;
    }

    if (std::strcmp(info->id, SCS_TELEMETRY_CONFIG_trailer) == 0 ||
        std::strncmp(info->id, "trailer.", 8) == 0) {
        size_t slot = 0;
        if (std::strncmp(info->id, "trailer.", 8) == 0 && std::isdigit(static_cast<unsigned char>(info->id[8]))) {
            slot = static_cast<size_t>(std::atoi(info->id + 8));
        }
        if (slot < kMaxTrailers) {
            TrailerState& tr = current_state.trailers[slot];
            tr.body_type[0] = '\0';
            tr.chain_type[0] = '\0';
            for (const scs_named_value_t* cur = info->attributes; cur && cur->name; ++cur) {
                if (cur->value.type == SCS_VALUE_TYPE_string) {
                    if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_body_type) == 0) {
                        CopySafeStr(tr.body_type, sizeof(tr.body_type), cur->value.value_string.value);
                    } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_chain_type) == 0) {
                        CopySafeStr(tr.chain_type, sizeof(tr.chain_type), cur->value.value_string.value);
                    }
                }
            }
        }
        return;
    }

    if (std::strcmp(info->id, SCS_TELEMETRY_CONFIG_job) == 0) {
        current_state.cargo_id[0] = '\0';
        current_state.cargo_name[0] = '\0';
        current_state.cargo_mass = 0.0f;
        current_state.source_city_id[0] = '\0';
        current_state.source_city[0] = '\0';
        current_state.destination_city_id[0] = '\0';
        current_state.destination_city[0] = '\0';
        current_state.source_company_id[0] = '\0';
        current_state.source_company[0] = '\0';
        current_state.destination_company_id[0] = '\0';
        current_state.destination_company[0] = '\0';
        current_state.planned_distance_km = 0;
        current_state.job_income = 0;
        current_state.delivery_time = 0;
        current_state.cargo_loaded = false;
        current_state.job_market[0] = '\0';
        current_state.is_special_job = false;

        for (const scs_named_value_t* cur = info->attributes; cur && cur->name; ++cur) {
            if (cur->value.type == SCS_VALUE_TYPE_string) {
                if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_cargo_id) == 0) {
                    CopySafeStr(current_state.cargo_id, sizeof(current_state.cargo_id), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_cargo) == 0) {
                    CopySafeStr(current_state.cargo_name, sizeof(current_state.cargo_name), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_source_city_id) == 0) {
                    CopySafeStr(current_state.source_city_id, sizeof(current_state.source_city_id), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_source_city) == 0) {
                    CopySafeStr(current_state.source_city, sizeof(current_state.source_city), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_destination_city_id) == 0) {
                    CopySafeStr(current_state.destination_city_id, sizeof(current_state.destination_city_id), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_destination_city) == 0) {
                    CopySafeStr(current_state.destination_city, sizeof(current_state.destination_city), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_source_company_id) == 0) {
                    CopySafeStr(current_state.source_company_id, sizeof(current_state.source_company_id), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_source_company) == 0) {
                    CopySafeStr(current_state.source_company, sizeof(current_state.source_company), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_destination_company_id) == 0) {
                    CopySafeStr(current_state.destination_company_id, sizeof(current_state.destination_company_id), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_destination_company) == 0) {
                    CopySafeStr(current_state.destination_company, sizeof(current_state.destination_company), cur->value.value_string.value);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_job_market) == 0) {
                    CopySafeStr(current_state.job_market, sizeof(current_state.job_market), cur->value.value_string.value);
                }
            } else if (cur->value.type == SCS_VALUE_TYPE_float) {
                if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_cargo_mass) == 0) {
                    current_state.cargo_mass = cur->value.value_float.value;
                }
            } else if (cur->value.type == SCS_VALUE_TYPE_u32) {
                if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_planned_distance_km) == 0) {
                    current_state.planned_distance_km = cur->value.value_u32.value;
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_delivery_time) == 0) {
                    current_state.delivery_time = cur->value.value_u32.value;
                }
            } else if (cur->value.type == SCS_VALUE_TYPE_u64) {
                if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_income) == 0) {
                    current_state.job_income = static_cast<int64_t>(cur->value.value_u64.value);
                }
            } else if (cur->value.type == SCS_VALUE_TYPE_s64) {
                if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_income) == 0) {
                    current_state.job_income = cur->value.value_s64.value;
                }
            } else if (cur->value.type == SCS_VALUE_TYPE_bool) {
                if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_is_cargo_loaded) == 0) {
                    current_state.cargo_loaded = (cur->value.value_bool.value != 0);
                } else if (std::strcmp(cur->name, SCS_TELEMETRY_CONFIG_ATTRIBUTE_special_job) == 0) {
                    current_state.is_special_job = (cur->value.value_bool.value != 0);
                }
            }
        }
    }
}

SCSAPI_VOID telemetry_gameplay_event(const scs_event_t event, const void* const event_info, const scs_context_t context) {
    UNUSED(event);
    UNUSED(context);
    const auto* info = static_cast<const scs_telemetry_gameplay_event_t*>(event_info);
    if (!info || !info->id) return;

    double simTimeSnapshot = 0.0;
    {
        std::lock_guard<std::mutex> lock(state_mutex);
        simTimeSnapshot = current_state.simulation_time;
    }

    GameplayEventItem item;
    item.id = info->id;
    item.sim_time = simTimeSnapshot;
    item.created_at_ms = NowMs();
    item.attrs_json = SerializeNamedAttributesJson(info->attributes);

    std::lock_guard<std::mutex> elock(event_mutex);
    item.seq = next_event_seq++;
    if (event_queue.size() >= kMaxEventQueueSize) {
        event_queue.pop_front();
    }
    event_queue.push_back(std::move(item));
}

} // namespace

SCSAPI_RESULT scs_telemetry_init(const scs_u32_t version, const scs_telemetry_init_params_t* const params) {
    if (version != SCS_TELEMETRY_VERSION_1_01) {
        return SCS_RESULT_unsupported;
    }

    const auto* version_params = static_cast<const scs_telemetry_init_params_v101_t*>(params);
    if (!version_params) {
        return SCS_RESULT_generic_error;
    }

    CopySafeStr(game_id, sizeof(game_id), version_params->common.game_id);
    LoadConfig();

    // Events
    version_params->register_for_event(SCS_TELEMETRY_EVENT_frame_start, telemetry_frame_start, nullptr);
    version_params->register_for_event(SCS_TELEMETRY_EVENT_paused, telemetry_paused_or_started, nullptr);
    version_params->register_for_event(SCS_TELEMETRY_EVENT_started, telemetry_paused_or_started, nullptr);
    version_params->register_for_event(SCS_TELEMETRY_EVENT_configuration, telemetry_configuration, nullptr);
    version_params->register_for_event(SCS_TELEMETRY_EVENT_gameplay, telemetry_gameplay_event, nullptr);

    // Common channels
    version_params->register_for_channel(SCS_TELEMETRY_CHANNEL_local_scale, SCS_U32_NIL, SCS_VALUE_TYPE_float, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_float, nullptr);
    version_params->register_for_channel(SCS_TELEMETRY_CHANNEL_game_time, SCS_U32_NIL, SCS_VALUE_TYPE_u32, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_u32, nullptr);
    version_params->register_for_channel(SCS_TELEMETRY_CHANNEL_multiplayer_time_offset, SCS_U32_NIL, SCS_VALUE_TYPE_s32, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_s32, nullptr);
    version_params->register_for_channel(SCS_TELEMETRY_CHANNEL_next_rest_stop, SCS_U32_NIL, SCS_VALUE_TYPE_s32, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_s32, nullptr);
    version_params->register_for_channel(SCS_TELEMETRY_CHANNEL_next_mandatory_break, SCS_U32_NIL, SCS_VALUE_TYPE_s32, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_s32, nullptr);

    // Truck placement & 3-axis physics
    const auto truckCtx = reinterpret_cast<scs_context_t>(static_cast<intptr_t>(-1));
    version_params->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_world_placement, SCS_U32_NIL, SCS_VALUE_TYPE_dplacement, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_dplacement, truckCtx);
    version_params->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_local_linear_velocity, SCS_U32_NIL, SCS_VALUE_TYPE_fvector, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_fvector, nullptr);
    version_params->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_local_angular_velocity, SCS_U32_NIL, SCS_VALUE_TYPE_fvector, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_fvector, nullptr);
    version_params->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_local_linear_acceleration, SCS_U32_NIL, SCS_VALUE_TYPE_fvector, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_fvector, nullptr);
    version_params->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_cabin_offset, SCS_U32_NIL, SCS_VALUE_TYPE_fplacement, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_fplacement, nullptr);
    version_params->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_cabin_angular_velocity, SCS_U32_NIL, SCS_VALUE_TYPE_fvector, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_fvector, nullptr);

    // Powertrain, inputs & brakes
    const char* floatTruckChannels[] = {
        SCS_TELEMETRY_TRUCK_CHANNEL_speed,
        SCS_TELEMETRY_TRUCK_CHANNEL_engine_rpm,
        SCS_TELEMETRY_TRUCK_CHANNEL_odometer,
        SCS_TELEMETRY_TRUCK_CHANNEL_fuel,
        SCS_TELEMETRY_TRUCK_CHANNEL_fuel_average_consumption,
        SCS_TELEMETRY_TRUCK_CHANNEL_fuel_range,
        SCS_TELEMETRY_TRUCK_CHANNEL_adblue,
        SCS_TELEMETRY_TRUCK_CHANNEL_cruise_control,
        SCS_TELEMETRY_TRUCK_CHANNEL_input_steering,
        SCS_TELEMETRY_TRUCK_CHANNEL_input_throttle,
        SCS_TELEMETRY_TRUCK_CHANNEL_input_brake,
        SCS_TELEMETRY_TRUCK_CHANNEL_input_clutch,
        SCS_TELEMETRY_TRUCK_CHANNEL_effective_steering,
        SCS_TELEMETRY_TRUCK_CHANNEL_effective_throttle,
        SCS_TELEMETRY_TRUCK_CHANNEL_effective_brake,
        SCS_TELEMETRY_TRUCK_CHANNEL_effective_clutch,
        SCS_TELEMETRY_TRUCK_CHANNEL_brake_air_pressure,
        SCS_TELEMETRY_TRUCK_CHANNEL_brake_temperature,
        SCS_TELEMETRY_TRUCK_CHANNEL_wear_engine,
        SCS_TELEMETRY_TRUCK_CHANNEL_wear_transmission,
        SCS_TELEMETRY_TRUCK_CHANNEL_wear_cabin,
        SCS_TELEMETRY_TRUCK_CHANNEL_wear_chassis,
        SCS_TELEMETRY_TRUCK_CHANNEL_wear_wheels,
        SCS_TELEMETRY_TRUCK_CHANNEL_navigation_distance,
        SCS_TELEMETRY_TRUCK_CHANNEL_navigation_time,
        SCS_TELEMETRY_TRUCK_CHANNEL_navigation_speed_limit,
        SCS_TELEMETRY_JOB_CHANNEL_cargo_damage,
    };
    for (const char* ch : floatTruckChannels) {
        version_params->register_for_channel(ch, SCS_U32_NIL, SCS_VALUE_TYPE_float, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_float, truckCtx);
    }

    version_params->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_retarder_level, SCS_U32_NIL, SCS_VALUE_TYPE_u32, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_u32, nullptr);
    version_params->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_engine_gear, SCS_U32_NIL, SCS_VALUE_TYPE_s32, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_s32, nullptr);
    version_params->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_displayed_gear, SCS_U32_NIL, SCS_VALUE_TYPE_s32, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_s32, nullptr);

    const char* boolTruckChannels[] = {
        SCS_TELEMETRY_TRUCK_CHANNEL_lblinker,
        SCS_TELEMETRY_TRUCK_CHANNEL_rblinker,
        SCS_TELEMETRY_TRUCK_CHANNEL_hazard_warning,
        SCS_TELEMETRY_TRUCK_CHANNEL_light_parking,
        SCS_TELEMETRY_TRUCK_CHANNEL_light_low_beam,
        SCS_TELEMETRY_TRUCK_CHANNEL_light_high_beam,
        SCS_TELEMETRY_TRUCK_CHANNEL_light_aux_front,
        SCS_TELEMETRY_TRUCK_CHANNEL_light_aux_roof,
        SCS_TELEMETRY_TRUCK_CHANNEL_light_beacon,
        SCS_TELEMETRY_TRUCK_CHANNEL_light_brake,
        SCS_TELEMETRY_TRUCK_CHANNEL_light_reverse,
        SCS_TELEMETRY_TRUCK_CHANNEL_wipers,
        SCS_TELEMETRY_TRUCK_CHANNEL_parking_brake,
        SCS_TELEMETRY_TRUCK_CHANNEL_motor_brake,
        SCS_TELEMETRY_TRUCK_CHANNEL_brake_air_pressure_warning,
        SCS_TELEMETRY_TRUCK_CHANNEL_brake_air_pressure_emergency,
        SCS_TELEMETRY_TRUCK_CHANNEL_fuel_warning,
        SCS_TELEMETRY_TRUCK_CHANNEL_adblue_warning,
        SCS_TELEMETRY_TRUCK_CHANNEL_oil_pressure_warning,
        SCS_TELEMETRY_TRUCK_CHANNEL_water_temperature_warning,
        SCS_TELEMETRY_TRUCK_CHANNEL_battery_voltage_warning,
        SCS_TELEMETRY_TRUCK_CHANNEL_electric_enabled,
        SCS_TELEMETRY_TRUCK_CHANNEL_engine_enabled,
        SCS_TELEMETRY_TRUCK_CHANNEL_differential_lock,
        SCS_TELEMETRY_TRUCK_CHANNEL_lift_axle,
        SCS_TELEMETRY_TRUCK_CHANNEL_trailer_lift_axle,
    };
    for (const char* ch : boolTruckChannels) {
        version_params->register_for_channel(ch, SCS_U32_NIL, SCS_VALUE_TYPE_bool, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_bool, truckCtx);
    }

    // Wheel surface & suspension (0..7)
    for (scs_u32_t w = 0; w < kTrackedWheels; ++w) {
        version_params->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_wheel_on_ground, w, SCS_VALUE_TYPE_bool, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_bool, truckCtx);
        version_params->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_wheel_substance, w, SCS_VALUE_TYPE_u32, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_u32, truckCtx);
        version_params->register_for_channel(SCS_TELEMETRY_TRUCK_CHANNEL_wheel_susp_deflection, w, SCS_VALUE_TYPE_float, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_float, truckCtx);
    }

    // Multi-trailers (0..9)
    for (size_t i = 0; i < kMaxTrailers; ++i) {
        const auto trCtx = reinterpret_cast<scs_context_t>(static_cast<intptr_t>(i));
        char chName[96];

        std::snprintf(chName, sizeof(chName), "trailer.%zu.connected", i);
        version_params->register_for_channel(chName, SCS_U32_NIL, SCS_VALUE_TYPE_bool, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_bool, trCtx);

        std::snprintf(chName, sizeof(chName), "trailer.%zu.world.placement", i);
        version_params->register_for_channel(chName, SCS_U32_NIL, SCS_VALUE_TYPE_dplacement, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_dplacement, trCtx);

        std::snprintf(chName, sizeof(chName), "trailer.%zu.cargo.damage", i);
        version_params->register_for_channel(chName, SCS_U32_NIL, SCS_VALUE_TYPE_float, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_float, trCtx);

        std::snprintf(chName, sizeof(chName), "trailer.%zu.wear.body", i);
        version_params->register_for_channel(chName, SCS_U32_NIL, SCS_VALUE_TYPE_float, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_float, trCtx);

        std::snprintf(chName, sizeof(chName), "trailer.%zu.wear.chassis", i);
        version_params->register_for_channel(chName, SCS_U32_NIL, SCS_VALUE_TYPE_float, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_float, trCtx);

        std::snprintf(chName, sizeof(chName), "trailer.%zu.wear.wheels", i);
        version_params->register_for_channel(chName, SCS_U32_NIL, SCS_VALUE_TYPE_float, SCS_TELEMETRY_CHANNEL_FLAG_none, telemetry_store_float, trCtx);
    }

    thread_running.store(true);
    desktop_thread = std::thread(DesktopSenderLoop);
    portal_thread = std::thread(PortalFallbackLoop);

    return SCS_RESULT_ok;
}

SCSAPI_VOID scs_telemetry_shutdown(void) {
    if (thread_running.exchange(false)) {
        sleep_cv.notify_all();
        if (desktop_thread.joinable()) {
            desktop_thread.join();
        }
        if (portal_thread.joinable()) {
            portal_thread.join();
        }
    }
}

#ifdef _WIN32
BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved) {
    UNUSED(hModule);
    UNUSED(lpReserved);
    switch (ul_reason_for_call) {
        case DLL_PROCESS_ATTACH:
        case DLL_THREAD_ATTACH:
        case DLL_THREAD_DETACH:
        case DLL_PROCESS_DETACH:
            break;
    }
    return TRUE;
}
#endif
