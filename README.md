# ENJOYTRUCKERS Desktop (DTS-G1D3 Digital Tachograph Client & Telemetry Plugin)

ENJOYTRUCKERS Desktop is an open-source (MIT) Tauri v2 desktop companion and SCS Telemetry SDK 1.16 plugin (`enjoy_telemetry.dll`) for **Euro Truck Simulator 2** and **American Truck Simulator**.

It provides a Transtron DTS-G1D3 inspired digital tachograph interface (`800x480`, click-through overlay mode, 3-axis G-force & smoothness monitoring, Japanese continuous-driving 430 rule tracking, offline WAL/gzip recording, and real-time navigation sync with [portal.truckers.jp](https://portal.truckers.jp)).

## Repository Contents

- `apps/desktop/`: Tauri v2 React/TypeScript frontend + Rust backend (`apps/desktop/src-tauri/`)
- `sdk/scs_sdk_1_16/`: SCS Software Telemetry SDK 1.16 headers (under `sdk_license.txt`) and the C++ `enjoy_plugin` source (`enjoy_telemetry.cpp`, `enjoy_telemetry.def`)

## Building from Source (Windows)

### Telemetry Plugin (`enjoy_telemetry.dll`)
Using Visual Studio Developer Command Prompt (x64):
```cmd
cd sdk\scs_sdk_1_16\enjoy_plugin
cl.exe /LD /MT /std:c++17 /I..\include enjoy_telemetry.cpp enjoy_telemetry.def user32.lib advapi32.lib shell32.lib wininet.lib /Fe:enjoy_telemetry.dll
```

### Desktop Application (`ENJOYTRUCKERS_*_x64-setup.exe`)
Requires Node.js 22+ and Rust stable (`x86_64-pc-windows-msvc`):
```bash
cd apps/desktop
npm ci
npx tauri build --bundles nsis
```

## Code Signing & Attribution

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

### Code Signing Policy

- Official Windows binaries (`ENJOYTRUCKERS_*_x64-setup.exe` and `enjoy_telemetry.dll`) are built exclusively from this public repository on GitHub-hosted `windows-latest` runners via `.github/workflows/release-signed.yml`.
- Signing requests are reviewed and approved solely by ENJOYTRUCKERS project maintainers and never allow unsigned forks or external user submissions to trigger releases.
- This software does not contain advertisements, tracking outside explicit gameplay telemetry, or obfuscated binaries.

## Privacy Policy

- Local telemetry data received from ETS2/ATS on `127.0.0.1:3001` stays on your machine unless you explicitly authenticate with your ENJOYTRUCKERS account token (`portal.truckers.jp`).
- Authentication tokens stored locally are encrypted with AES-256-GCM bound to the local machine identifier.
- You may inspect all network destinations and payloads directly in this open-source repository.

## Team

- Maintainers: ENJOYTRUCKERS Organization (`@tkDec18`)

## License

- Desktop application & `enjoy_plugin`: [MIT License](LICENSE)
- SCS Telemetry SDK 1.16 headers (`sdk/scs_sdk_1_16/include/`): SCS Software license (`sdk/scs_sdk_1_16/sdk_license.txt`)
