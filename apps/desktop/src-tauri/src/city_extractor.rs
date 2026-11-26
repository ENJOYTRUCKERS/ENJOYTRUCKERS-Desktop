use flate2::read::ZlibDecoder;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;

use crate::plugin_manager::{collect_steamapps_dirs, find_installed_game_dirs};
use crate::telemetry::PORTAL_BASE_URL;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct CitySyncState {
    pub ets2_build_id: Option<String>,
    pub ats_build_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedCity {
    pub in_game_id: Option<String>,
    pub real_name: String,
    pub en_name: Option<String>,
    pub ja_name: Option<String>,
    pub country: Option<String>,
    pub country_ja: Option<String>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub dlc_name: Option<String>,
    pub source: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CitySyncSummary {
    pub game: String,
    pub build_id: Option<String>,
    pub skipped: bool,
    pub extracted_count: usize,
    pub synced_count: usize,
}

fn read_build_id(app_id: &str) -> Option<String> {
    let manifest_name = format!("appmanifest_{}.acf", app_id);
    for steamapps in collect_steamapps_dirs() {
        let p = steamapps.join(&manifest_name);
        if let Ok(content) = fs::read_to_string(&p).map_err(|e| log::error!("Failed to read file {:?}: {}", p, e)) {
            log::info!("Successfully read content from {:?}", p);

            for line in content.lines() {
                let t = line.trim();
                if t.starts_with("\"buildid\"") {
                    let parts: Vec<&str> = t.split('"').filter(|s| !s.trim().is_empty()).collect();
                    if parts.len() >= 2 && parts[0] == "buildid" {
                        return Ok(parts[1].trim().to_string());
        }
    }
}

None
                    }
                }
            }
        }
    }
    None
}

fn load_sync_state(app: &tauri::AppHandle) -> CitySyncState {
    fn read_default_build_id(game: &str) -> Option<String> {
        // ここにデフォルトのビルドIDを読み込むロジックを追加
        None
    }

    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let path = dir.join("city_sync_state.json");
    if let Ok(txt) = fs::read_to_string(path) {
        serde_json::from_str(&txt).map_err(|e| log::error!("Failed to deserialize city sync state: {}", e)).unwrap_or_default()
    } else {
        CitySyncState { ets2_build_id: read_default_build_id("ets2"), ats_build_id: read_default_build_id("ats") }
    }
}

fn save_sync_state(app: &tauri::AppHandle, state: &CitySyncState) {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    if !dir.exists() && fs::create_dir_all(&dir).is_err() { log::error!("Failed to create directory {:?}: {}", dir, e); return Err("Failed to create directory".to_string()); }
    log::error!("Failed to create directory {:?}: {}", dir, e);
}
    let path = dir.join("city_sync_state.json");
    if let Ok(json) = serde_json::to_string_pretty(state).map_err(|e| log::error!("Failed to serialize city sync state: {}", e)) {
        if let Err(e) = fs::write(path, json) { log::error!("Failed to write to {:?}: {}", path, e); return Err("Failed to write to file".to_string()); }
    log::error!("Failed to write to {:?}: {}", path, e);
}
    }
}

/// Computes CityHash64 matching SCS HashFS path hashing (little-endian).
pub fn cityhash64(s: &[u8]) -> u64 {
    const MAX_LEN: usize = 1024 * 1024; // 1MB
    if s.len() > MAX_LEN { eprintln!("Input data is too long"); return 0; }
        eprintln!("Input data is too long");
        return 0;
    }
    const K0: u64 = 0xc3a5c85c97cb3127;
    const K1: u64 = 0xb492b66fbe98f273;
    const K2: u64 = 0x9ae16a3b2f90404f;

    #[inline]
    fn fetch64(p: &[u8], off: usize) -> u64 {
        let mut b = [0u8; 8];
        b.copy_from_slice(&p[off..off + 8]);
        u64::from_le_bytes(b)
    }

    #[inline]
    fn fetch32(p: &[u8], off: usize) -> u64 {
        let mut b = [0u8; 4];
        b.copy_from_slice(&p[off..off + 4]);
        u32::from_le_bytes(b) as u64
    }

    #[inline]
    fn shift_mix(val: u64) -> u64 {
        val ^ (val >> 47)
    }

    #[inline]
    fn hash_len_16(u: u64, v: u64, mul: u64) -> u64 {
        let mut a = (u ^ v).wrapping_mul(mul);
        a ^= a >> 47;
        let mut b = (v ^ a).wrapping_mul(mul);
        b ^= b >> 47;
        b = b.wrapping_mul(mul);
        b
    }

    #[inline]
    fn hash_len_0_to_16(s: &[u8]) -> u64 {
        let len = s.len();
        if len >= 8 {
            let mul = K2.wrapping_add((len as u64) * 2);
            let a = fetch64(s, 0).wrapping_add(K2);
            let b = fetch64(s, len - 8);
            let c = b.rotate_right(37).wrapping_mul(mul).wrapping_add(a);
            let d = a.rotate_right(25).wrapping_add(b).wrapping_mul(mul);
            return hash_len_16(c, d, mul);
        }
        if len >= 4 {
            let mul = K2.wrapping_add((len as u64) * 2);
            let a = fetch32(s, 0);
            return hash_len_16((len as u64).wrapping_add(a << 3), fetch32(s, len - 4), mul);
        }
        if len > 0 {
            let a = s[0] as u64;
            let b = s[len >> 1] as u64;
            let c = s[len - 1] as u64;
            let y = a.wrapping_add(b << 8);
            let z = (len as u64).wrapping_add(c << 2);
            return shift_mix(y.wrapping_mul(K2) ^ z.wrapping_mul(K0)).wrapping_mul(K2);
        }
        K2
    }

    let len = s.len();
    if len <= 16 {
        return hash_len_0_to_16(s);
    }
    if len <= 32 {
        let mul = K2.wrapping_add((len as u64) * 2);
        let a = fetch64(s, 0).wrapping_mul(K1);
        let b = fetch64(s, 8);
        let c = fetch64(s, len - 8).wrapping_mul(mul);
        let d = fetch64(s, len - 16).wrapping_mul(K2);
        return hash_len_16(
            a.wrapping_add(b).rotate_right(43).wrapping_add(c.rotate_right(30)).wrapping_add(d),
            a.wrapping_add(b.wrapping_add(K2).rotate_right(18)).wrapping_add(c),
            mul,
        );
    }
    if len <= 64 {
        let mul = K2.wrapping_add((len as u64) * 2);
        let mut a = fetch64(s, 0).wrapping_mul(K2);
        let mut b = fetch64(s, 8);
        let c = fetch64(s, len - 24);
        let d = fetch64(s, len - 32);
        let e = fetch64(s, 16).wrapping_mul(K2);
        let f = fetch64(s, 24).wrapping_mul(9);
        let g = fetch64(s, len - 8);
        let h = fetch64(s, len - 16).wrapping_mul(mul);
        let u = a.wrapping_add(g).rotate_right(43).wrapping_add((b.rotate_right(30).wrapping_add(c)).wrapping_mul(9));
        let v = ((a.wrapping_add(g)) ^ d).wrapping_add(f).wrapping_add(1);
        let w = ((u.wrapping_add(v)).wrapping_mul(mul)).swap_bytes().wrapping_add(h);
        let x = e.wrapping_add(f).rotate_right(42).wrapping_add(c);
        a = w.wrapping_add(v);
        b = shift_mix((a.wrapping_add(x)).wrapping_mul(mul).wrapping_add(b)).wrapping_mul(mul);
        return hash_len_16(u.wrapping_add(b), w.wrapping_add(d), mul);
    }

    let mut x = fetch64(s, len - 40);
    let mut y = fetch64(s, len - 16).wrapping_add(fetch64(s, len - 56));
    let mut z = hash_len_16(
        fetch64(s, len - 48).wrapping_add(len as u64),
        fetch64(s, len - 24),
        K2,
    );
    let mut v_lo = 0u64;
    let mut v_hi = 0u64;
    let mut w_lo = 0u64;
    let mut w_hi = 0u64;
    x = x.wrapping_mul(K2).wrapping_add(fetch64(s, 0));

    let mut pos = 0usize;
    let mut rem = len;
    loop {
        x = x.wrapping_add(y).wrapping_add(v_lo).wrapping_add(fetch64(s, pos + 8)).rotate_right(37).wrapping_mul(K1);
        y = y.wrapping_add(v_hi).wrapping_add(fetch64(s, pos + 48)).rotate_right(42).wrapping_mul(K1);
        x ^= w_hi;
        y = y.wrapping_add(v_lo).wrapping_add(fetch64(s, pos + 40));
        z = z.wrapping_add(w_lo).rotate_right(33).wrapping_mul(K1);

        let a = fetch64(s, pos);
        let b = fetch64(s, pos + 8);
        let c = fetch64(s, pos + 16);
        let d = fetch64(s, pos + 24);
        v_lo = v_hi.wrapping_add(a).wrapping_add(b);
        v_hi = v_lo.wrapping_add(c).wrapping_add(d).rotate_right(44);
        w_lo = y.wrapping_add(z).wrapping_add(fetch64(s, pos + 32));
        w_hi = w_lo.wrapping_add(fetch64(s, pos + 56));
        std::mem::swap(&mut z, &mut x);
        pos += 64;
        rem -= 64;
        if rem <= 64 || rem < 0 {
            break;
        }
    }
    hash_len_16(
        hash_len_16(v_lo, w_lo, K2).wrapping_add(shift_mix(y).wrapping_mul(K1)).wrapping_add(z),
        hash_len_16(v_hi, w_hi, K2).wrapping_add(x),
        K2,
    )
}

fn read_u16_le(b: &[u8], off: usize) -> Option<u16> {
    if off + 2 > b.len() { eprintln!("Error: Failed to read u16 at offset {}: out of bounds (buffer length {})", off, b.len()); return None; }
        eprintln!("Error: Failed to read u16 at offset {}: out of bounds (buffer length {})", off, b.len());
        return None;
    }
    b.get(off..off + 2).map(|s| u16::from_le_bytes([s[0], s[1]])).or_else(|| {
        eprintln!("Failed to read u16 at offset {}", off);
        None
    })
}
fn read_u32_le(b: &[u8], off: usize) -> Option<u32> {
    if off + 4 > b.len() { eprintln!("Error: Failed to read u32 at offset {}: out of bounds (buffer length {})", off, b.len()); return None; }
        eprintln!("Error: Failed to read u32 at offset {}: out of bounds (buffer length {})", off, b.len());
        return None;
    }
    b.get(off..off + 4)
        .map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
        .or_else(|| {
            eprintln!("Failed to read u32 at offset {}", off);
            None
        })
}
fn read_u64_le(b: &[u8], off: usize) -> Option<u64> {
    if off + 8 > b.len() { eprintln!("Error: Failed to read u64 at offset {}: out of bounds (buffer length {})", off, b.len()); return None; }
        eprintln!("Error: Failed to read u64 at offset {}: out of bounds (buffer length {})", off, b.len());
        return None;
    }
    b.get(off..off + 8)
        .map(|s| u64::from_le_bytes([s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]]))
        .or_else(|| {
            eprintln!("Failed to read u64 at offset {}", off);
            None
        })
}

/// Parses an official HashFS v1 `.scs` archive into SII UTF-8 text snippets from relevant def/locale entries.
fn extract_text_entries_hashfs_v1(file: &mut File) -> Result<Vec<(String, String)>, String> {
    let mut header = [0u8; 20];
    if let Err(e) = file.seek(SeekFrom::Start(0)) {
        log::error!("Failed to seek archive header: {}", e);
        return Err("Failed to seek archive header".to_string());
    }
    if let Err(e) = file.read_exact(&mut header) {
        log::error!("Failed to read archive header: {}", e);
        return Err("Failed to read archive header".to_string());
    }
    if &header[0..4] != b"SCS#" {
        return Err("Invalid archive header".to_string());
    }
    let version = read_u16_le(&header, 4).ok_or_else(|| "Failed to read version".to_string())?;
    if version != 1 {
        return Err("Unsupported version".to_string());
    }
    let entry_count = read_u32_le(&header, 12).ok_or_else(|| "Failed to read entry count".to_string())? as usize;
if entry_count == 0 || entry_count > 500_000 {
    log::error!("Invalid entry count: {}", entry_count);
    return Err("Invalid entry count".to_string());
}
    let start_offset = read_u32_le(&header, 16).ok_or_else(|| "Failed to read start offset".to_string())? as u64;

    let table_len = entry_count.saturating_mul(32);
    let mut table = vec![0u8; table_len];
    if let Err(e) = file.seek(SeekFrom::Start(start_offset)) {
        log::error!("Failed to seek archive table: {}", e);
        return Err("Failed to seek archive table".to_string());
    }
    if let Err(e) = file.read_exact(&mut table) {
        log::error!("Failed to read archive table: {}", e);
        return Err(e.to_string());
    }

    struct V1Entry {
    offset: u64,
    flags: u32,
    size: u32,
    csize: u32,
    name: String,
    type_: String,
    hash: u64,
}
        offset: u64,
        flags: u32,
        size: u32,
        csize: u32,
        flags: u32,
        size: u32,
        csize: u32,
        name: String,
        type_: String,
        hash: u64,
    }
        offset: u64,
        flags: u32,
        size: u32,
        csize: u32,
        name: String,
        type_: String,
        hash: u64,
    }
    let mut by_hash = HashMap::with_capacity(entry_count);
    for i in 0..entry_count.min(500_000) {
        let base = i * 32;
        let hash = read_u64_le(&table, base).unwrap_or(0);
        let offset = read_u64_le(&table, base + 8).unwrap_or(0);
        let flags = read_u32_le(&table, base + 16).unwrap_or(0);
        let size = read_u32_le(&table, base + 24).unwrap_or(0);
        let csize = read_u32_le(&table, base + 28).unwrap_or(0);
        by_hash.insert(hash, V1Entry { offset, flags, size, csize, name: String::new(), type_: String::new(), hash });
    }

    let read_entry = |f: &mut File, e: &V1Entry| -> Option<Vec<u8>> {
        if e.csize == 0 || e.csize > 32 * 1024 * 1024 || e.size > 64 * 1024 * 1024 {
            return None;
        }
        let mut raw = vec![0u8; e.csize as usize];
        f.seek(SeekFrom::Start(e.offset)).ok()?;
        f.read_exact(&mut raw).ok()?;
        if (e.flags & 0x02) != 0 || e.csize != e.size {
            let mut dec = ZlibDecoder::new(&raw[..]);
            let mut out = Vec::new();
            dec.read_to_end(&mut out).ok()?;
            Some(out)
        } else {
            Some(raw)
        }
    };

    let mut texts = Vec::new();
    let probe_dirs = ["def/city", "def/country", "locale/ja_jp"];
    let direct_files = [
        "def/city.sii",
        "def/country.sii",
        "locale/ja_jp/local.sii",
        "locale/en_us/local.sii",
    ];

    for p in direct_files {
        let h = cityhash64(p.as_bytes());
        if let Some(e) = by_hash.get(&h) {
            if let Some(bytes) = read_entry(file, e) {
                if let Ok(s) = String::from_utf8(bytes) {
                    texts.push((p.to_string(), s));
                }
            }
        }
    }

    for dir in probe_dirs {
        let h = cityhash64(dir.as_bytes());
        if let Some(e) = by_hash.get(&h) {
            if let Some(bytes) = read_entry(file, e) {
                if let Ok(listing) = String::from_utf8(bytes) {
                    for line in listing.lines() {
                        let name = line.trim();
                        if name.is_empty() || name.starts_with('*') {
                            continue;
                        }
                        if name.ends_with(".sui") || name.ends_with(".sii") {
                            let full = format!("{}/{}", dir, name);
                            if let Some(child) = by_hash.get(&cityhash64(full.as_bytes())) {
                                if let Some(cbytes) = read_entry(file, child) {
                                    if let Ok(cs) = String::from_utf8(cbytes) {
                                        texts.push((full, cs));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    texts
}

/// Fallback safe Zlib SII text scanner for HashFS v2 (ETS2/ATS 1.50+) official def/locale `.scs` files.
/// Only keeps valid UTF-8 `SiiNunit` / `city_data` / `localization_db` streams.
fn scan_official_zlib_sii_streams(path: &Path) -> Vec<(String, String)> {
    let mut results = Vec::new();
    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return results,
    };
    // Only scan metadata archives (def.scs, locale.scs, small dlc defs <= 180MB) to keep sync instant
    if meta.len() > 180 * 1024 * 1024 {
        return results;
    }

    let mut data = Vec::new();
    if File::open(path).and_then(|mut f| f.read_to_end(&mut data)).is_err() {
        return results;
    }

    // First verify HashFS magic header
    if data.len() < 20 || &data[0..4] != b"SCS#" {
        return results;
    }

    let name_tag = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("archive.scs")
        .to_string();

    let mut i = 20usize;
    let max_scan = data.len().saturating_sub(8);
    while i < max_scan {
        // Common zlib headers: 0x78 0x9C or 0x78 0xDA
        if data[i] == 0x78 && (data[i + 1] == 0x9C || data[i + 1] == 0xDA) {
            let mut dec = ZlibDecoder::new(&data[i..]);
            let mut out = Vec::new();
            let mut buf = [0u8; 4096];
            let mut ok = true;
            loop {
                match dec.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if out.len() + n > 2 * 1024 * 1024 {
                            ok = false;
                            break;
                        }
                        out.extend_from_slice(&buf[..n]);
                    }
                    Err(_) => {
                        ok = false;
                        break;
                    }
                }
            }
            if ok && !out.is_empty() {
                if let Ok(txt) = String::from_utf8(out) {
                    if txt.contains("city_data") || txt.contains("localization_db") || txt.contains("city_name") {
                        let consumed = dec.total_in() as usize;
                        results.push((format!("{}@0x{:x}", name_tag, i), txt));
                        i = i.saturating_add(consumed.max(2));
                        continue;
                    }
                }
            }
        }
        i += 1;
    }

    results
}

fn extract_sii_quoted(line: &str) -> Option<String> {
    let first = line.find('"')?;
    let rest = &line[first + 1..];
    let second = rest.find('"')?;
    Some(rest[..second].to_string())
}

fn parse_cities_and_locale(
    entries: &[(String, String)],
    dlc_label: Option<&str>,
) -> (Vec<ExtractedCity>, HashMap<String, String>) {
    let mut ja_locale: HashMap<String, String> = HashMap::new();
    let mut raw_cities: Vec<ExtractedCity> = Vec::new();

    for (src_name, text) in entries {
        // 1. Parse localization key[] / val[] blocks (ja_jp locale files only)
        //    NOTE: zh_tw / zh_cn 等も漢字を含むため、漢字や非ASCIIの有無では判定しない。
        //    ファイル名が ja_jp、または本文にかな（ひらがな/カタカナ）を含む場合のみ日本語ロケールとみなす。
        let has_kana = |s: &str| {
            s.chars().any(|c| matches!(c, '\u{3040}'..='\u{309F}' | '\u{30A0}'..='\u{30FF}'))
        };
        let is_ja_src = src_name.contains("ja_jp") || has_kana(text.as_str());
        if is_ja_src && (text.contains("localization_db") || (text.contains("key[") && text.contains("val["))) {
            let mut pending_key: Option<String> = None;
            for line in text.lines() {
                let t = line.trim();
                if t.starts_with("key[") {
                    pending_key = extract_sii_quoted(t);
                } else if t.starts_with("val[") {
                    if let (Some(k), Some(v)) = (pending_key.take(), extract_sii_quoted(t)) {
                        ja_locale.insert(k, v);
                    }
                }
            }
        }

        // 2. Parse `city_data : city.<id> { ... }` blocks
        let mut current_id: Option<String> = None;
        let mut city_name = String::new();
        let mut city_loc = String::new();
        let mut country = String::new();

        for line in text.lines() {
            let t = line.trim();
            if let Some(after) = t.strip_prefix("city_data") {
                if let Some(dot_idx) = after.find("city.") {
                    let id_part = &after[dot_idx + 5..];
                    let id_clean = id_part
                        .split(|c: char| c.is_whitespace() || c == '{' || c == ':')
                        .next()
                        .unwrap_or("")
                        .trim();
                    if !id_clean.is_empty() {
                        current_id = Some(id_clean.to_lowercase());
                        city_name.clear();
                        city_loc.clear();
                        country.clear();
                    }
                }
                continue;
            }

            if current_id.is_some() {
                if t.starts_with('}') {
                    if let Some(cid) = current_id.take() {
                        if !city_name.is_empty() {
                            raw_cities.push(ExtractedCity {
                                in_game_id: Some(cid),
                                real_name: city_name.clone(),
                                en_name: Some(city_name.clone()),
                                ja_name: if !city_loc.is_empty() {
                                    Some(city_loc.trim_matches('@').to_string())
                                } else {
                                    None
                                },
                                country: if country.is_empty() {
                                    None
                                } else {
                                    Some(country.clone())
                                },
                                country_ja: None,
                                x: None,
                                y: None,
                                dlc_name: dlc_label.map(|s| s.to_string()),
                                source: "scs_extract".to_string(),
                            });
                        }
                    }
                } else if t.starts_with("city_name_localized:") {
                    if let Some(val) = extract_sii_quoted(t) {
                        city_loc = val;
                    }
                } else if t.starts_with("city_name:") {
                    if let Some(val) = extract_sii_quoted(t) {
                        city_name = val;
                    }
                } else if t.starts_with("country:") {
                    if let Some(val) = t.split(':').nth(1) {
                        country = val.trim().trim_matches('"').to_string();
                    }
                }
            }
        }
    }

    (raw_cities, ja_locale)
}

fn collect_official_scs_archives(game_dir: &Path) -> Vec<(PathBuf, Option<String>)> {
    let mut list = Vec::new();
    let Ok(rd) = fs::read_dir(game_dir) else {
        return list;
    };
    for entry in rd.filter_map(Result::ok) {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        let Some(fname) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !fname.ends_with(".scs") {
            continue;
        }
        // Vanilla + Official DLC archives only (never Documents/mod)
        if fname == "def.scs" || fname == "locale.scs" {
            list.push((p, None));
        } else if fname.starts_with("dlc_") {
            let label = fname.trim_end_matches(".scs").to_string();
            list.push((p, Some(label)));
        }
    }
    list
}

fn extract_game_cities(game_dir: &Path) -> Vec<ExtractedCity> {
    let archives = collect_official_scs_archives(game_dir);
    let mut all_cities: Vec<ExtractedCity> = Vec::new();
    let mut global_locale: HashMap<String, String> = HashMap::new();

    for (archive_path, dlc_label) in archives {
        let mut entries = match File::open(&archive_path) {
            Ok(mut f) => extract_text_entries_hashfs_v1(&mut f),
            Err(_) => Vec::new(),
        };
        if entries.is_empty() {
            entries = scan_official_zlib_sii_streams(&archive_path);
        }
        if !entries.is_empty() {
            let (cities, loc) = parse_cities_and_locale(&entries, dlc_label.as_deref());
            all_cities.extend(cities);
            global_locale.extend(loc);
        }
    }

    // Resolve @@key@@ city localization & country translations using extracted Japanese locale
    let mut dedup: HashMap<String, ExtractedCity> = HashMap::new();
    for mut c in all_cities {
        let lookup_key = c
            .ja_name
            .as_deref()
            .unwrap_or("")
            .trim_matches('@')
            .to_string();
        let resolved_ja = if !lookup_key.is_empty() {
            global_locale.get(&lookup_key).cloned()
        } else if let Some(cid) = &c.in_game_id {
            global_locale.get(cid).cloned()
        } else {
            None
        };
        c.ja_name = resolved_ja.or_else(|| c.ja_name.filter(|s| !s.is_empty() && !s.contains('@')));

        if let Some(ref ctry) = c.country {
            if let Some(cja) = global_locale.get(ctry) {
                c.country_ja = Some(cja.clone());
            }
        }

        let key = c
            .in_game_id
            .clone()
            .unwrap_or_else(|| c.real_name.to_lowercase());
        dedup.entry(key).or_insert(c);
    }

    dedup.into_values().collect()
}

#[tauri::command]
pub fn sync_official_cities(
    app: tauri::AppHandle,
    token: String,
    force: bool,
) -> Result<Vec<CitySyncSummary>, String> {
    if token.trim().is_empty() {
        return Err("Telemetry token is required".to_string());
    }

    let mut sync_state = load_sync_state(&app);
    let mut summaries = Vec::new();
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let endpoint = format!("{}/api/admin/cities/sync", PORTAL_BASE_URL);

    for game_dir in find_installed_game_dirs() {
        let dir_str = game_dir.to_string_lossy();
        let (game, app_id, prev_build) = if dir_str.contains("American Truck Simulator") {
            ("ats", "270880", sync_state.ats_build_id.clone())
        } else {
            ("ets2", "227300", sync_state.ets2_build_id.clone())
        };

        let cur_build = read_build_id(app_id);
        if !force && cur_build.is_some() && cur_build == prev_build {
            summaries.push(CitySyncSummary {
                game: game.to_string(),
                build_id: cur_build,
                skipped: true,
                extracted_count: 0,
                synced_count: 0,
            });
            continue;
        }

        let cities = extract_game_cities(&game_dir);
        let extracted_count = cities.len();
        let mut synced_count = 0usize;

        for chunk in cities.chunks(1000) {
            let body = serde_json::json!({
                "token": token,
                "game": game,
                "gameBuildId": cur_build,
                "cities": chunk,
            });
            let res = client
                .post(&endpoint)
                .header("Authorization", format!("Bearer {}", token))
                .json(&body)
                .send()
                .map_err(|e| format!("Sync request failed: {}", e))?;

            if !res.status().is_success() {
                let status = res.status();
                let txt = res.text().unwrap_or_default();
                return Err(format!("City sync failed ({}): {}", status, txt));
            }
            synced_count += chunk.len();
        }

        if game == "ats" {
            sync_state.ats_build_id = cur_build.clone();
        } else {
            sync_state.ets2_build_id = cur_build.clone();
        }

        summaries.push(CitySyncSummary {
            game: game.to_string(),
            build_id: cur_build,
            skipped: false,
            extracted_count,
            synced_count,
        });
    }

    save_sync_state(&app, &sync_state);
    Ok(summaries)
}
