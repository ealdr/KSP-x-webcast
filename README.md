<p align="center">
  <img src="/logo.png" alt="KSP-X Webcast" width="700">
</p>

<p align="center">
  <a href="https://github.com/ealdr/ksp-x-webcast/releases/latest"><img src="https://img.shields.io/badge/release-v1.0-3da9fc?style=flat-square" alt="Release"></a>
  <a href="https://github.com/ealdr/ksp-x-webcast/releases"><img src="https://img.shields.io/github/downloads/ealdr/ksp-x-webcast/total?style=flat-square&color=3da9fc&label=downloads" alt="Downloads"></a>
  <a href="https://github.com/ealdr/ksp-x-webcast/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-3da9fc?style=flat-square" alt="License"></a>
  <a href="https://github.com/ealdr/ksp-x-webcast/stargazers"><img src="https://img.shields.io/github/stars/ealdr/ksp-x-webcast?style=flat-square&color=3da9fc" alt="Stars"></a>
</p>

---

Welcome to **KSP-X Webcast**; a SpaceX-style live telemetry overlay for Kerbal Space Program. It composites a real-time HUD with speed, altitude, MET clock, and a mission timeline arc over [JustReadTheInstructions](https://github.com/RELMYMathieu/JustReadTheInstructions) HullCam feeds, powered by [Telemachus Reborn](https://github.com/TeleIO/Telemachus-1) for live flight data - taking inspiration from [Houston](https://github.com/TeleIO/houston).

<img width="2546" height="1264" alt="image" src="https://github.com/user-attachments/assets/ea1c32d8-79fd-4b07-ac53-3581fc2d1152" />
<img width="504" height="175" alt="image" src="https://github.com/user-attachments/assets/f4ec2ef8-3dad-4539-81a7-446c838cfa52" />
<img width="320" height="38" alt="image" src="https://github.com/user-attachments/assets/c463043b-d2aa-4f4d-8e11-34137e643a65" />
<img width="223" height="149" alt="image" src="https://github.com/user-attachments/assets/ac808327-bf04-4b76-8bce-983b4d35bb71" />
<img width="157" height="127" alt="image" src="https://github.com/user-attachments/assets/aef66d0c-b8ee-45cf-acf7-72d611e55fa5" />





## Features

- **Speed & Altitude dials** - thin arc gauges with soft blue-white glow
- **Mission Elapsed Time clock** - large `T+HH:MM:SS` display, auto-starts on liftoff
- **Mission timeline arc** - curved arc with draggable milestone markers (LIFTOFF, MAX-Q, MECO, SECO, and more)
- **MAX-Q auto-detection** - calculates dynamic pressure live using Kerbin's atmosphere model (Q = ½ρv²), marker approaches in real time and locks when the peak is confirmed
- **MECO / SECO auto-detection** - detects engine cutoffs by watching for sustained speed deceleration, no thrust data needed
- **Live camera feeds** - paste any JRTI HullCam URL and it appears full-screen behind the HUD
- **Multi-camera grid** - 1, 2, 4, or 6 camera layouts with arrow-button cycling
- **Demo mode** - runs a simulated Kerbin launch when KSP is not connected, so you can preview the overlay any time
- **Mission profiles** - switch between Orbital, Booster Landing, Payload Deploy, and Re-Entry profiles from a dropdown


---
## How to use
  ### Getting your milestone times right

  The milestone times shown on the timeline are estimates - every rocket is different. For the best results:

  1. Do a test flight and note the mission elapsed time (T+) when each event happens - MECO,
  SECO, coasting, landing burn, etc.
  2. Before your next flight, in the VAB, drag each milestone marker on the timeline to match those recorded times and press 'START'
  3. The overlay will then show the markers passing in sync with your actual rocket.

  You only need to do this once per rocket design. If you change your staging or TWR, do another test flight to
  re-record the times.

  ### Setting up cameras

  1. Place **HullCam** cameras on your rocket in the VAB - put them on stages that will be in view during key moments
  (booster, payload fairing, engine bell)
  2. Launch KSP and open the JRTI window in-game to confirm your cameras are active
  3. In the overlay, click the camera panel in the top-left
  4. Open `http://localhost:8080` in a browser tab, switch between cameras in the JRTI UI, and copy the URL from your
  browser address bar for each one (e.g. `http://localhost:8080/camera/1234567890`)
  5. Paste a camera URL into the overlay panel and click **Connect**
  6. If you need to add more at anytime click the cogwheel to re-open the URLs pannel. **(JRTI max cam limit is 6, but this may change in the future)**
  7. Use the **+Add** button to add more cameras, then switch between them with the arrow buttons or cycle through grid
  layouts (1, 2, 4, 6 cameras)
   





---
## Prerequisites

Install these KSP mods before running the overlay:

| Mod | Purpose |
|-----|---------|
| [HullcamVDS Continued](https://github.com/linuxgurugamer/HullcamVDSContinued) | Onboard cameras |
| [JustReadTheInstructions (JRTI)](https://github.com/RELMYMathieu/JustReadTheInstructions) | Serves camera feeds to the browser |
| [Telemachus Reborn](https://github.com/TeleIO/Telemachus-1) | Streams live telemetry over WebSocket |

You also need **Node.js 20+** on your PC to run the dev server.

---

## Installation

```bash
git clone https://github.com/ealdr/ksp-x-webcast.git
cd ksp-x-webcast
npm install
```

---

## Usage

**1. Start KSP** with JRTI and Telemachus Reborn active. Note the ports - Telemachus defaults to `8085`, JRTI defaults to `8080`.

**2. Start the overlay dev server:**

```bash
npm run dev
```

Open `http://localhost:3000` in your browser (or `http://YOUR_LAN_IP:3000` from another device on your network).

**3. Connect a camera** - click the camera panel in the top-left, paste a JRTI camera URL (e.g. `http://localhost:8080/camera/1234567890`), and click Connect. The camera ID shown in JRTI changes every KSP session so always copy it fresh.

**4. Select a mission profile** from the dropdown on the left side of the HUD.

**5. Press START** when you are ready to begin the mission timer, or it will auto-start the moment your rocket lifts off.

---

## Mission Profiles

| Profile | Description |
|---------|-------------|
| **Orbital** | Standard Kerbin-to-LKO launch with LIFTOFF, MAX-Q, MECO, SECO |
| **Booster Landing** | Tracks the booster through separation, boostback, re-entry, and landing |
| **Payload Deploy** | Upper stage profile with two SECO burns and payload deployment |
| **Re-Entry** | Capsule re-entry from deorbit burn through main chute and landing |

Milestone times shown on the timeline are estimates - detected events (MAX-Q, MECO, SECO) update automatically during flight.

### Dragging milestones

Any milestone marker on the timeline can be dragged left or right to adjust its expected time before launch. Detected milestones (MAX-Q, MECO, SECO) are locked once they trigger. Dragging the last milestone to the right extends the timeline.

---

## How auto-detection works

**MAX-Q** - The overlay calculates dynamic pressure every second using Kerbin's exponential atmosphere model (ρ₀ = 1.223 kg/m³, scale height 5842 m). The MAX-Q marker drifts ahead of the current time while Q is rising, then snaps back to the confirmed peak once Q has dropped for over a second.

**MECO** - Detected when rocket speed drops more than 5 m/s below its peak and stays down for at least 1 second, with a minimum peak speed of 200 m/s to filter out staging transients.

**SECO** - Same logic as MECO, but only activates at least 6 seconds after MECO triggers (giving the upper stage time to ignite).

---

## Ports

| Service | Default port | Configurable in |
|---------|-------------|-----------------|
| Overlay (this app) | `3000` | `vite.config.ts` |
| Telemachus Reborn | `8085` | Telemachus in-game settings |
| JRTI camera server | `8080` | JRTI in-game settings |

---
 ## Reporting Issues

  If you find a bug or something doesn't work as expected:

  1. Open the browser console (F12 → Console) and copy any red errors
  2. Note your KSP version, Telemachus version, and JRTI version
  3. Describe what you did, what you expected, and what actually happened
  4. [Open an issue on GitHub](https://github.com/ealdr/ksp-x-webcast/issues)
---
 ## OBS Integration

  The overlay works as a native OBS browser source.

  1. In OBS, add a **Browser Source**
  2. Set the URL to `http://localhost:3000`
  3. Set width and height to match your stream resolution (e.g. 1920×1080)

  The camera feed, HUD, and timeline will composite directly in OBS for recording.

  ---

  ## Limitations

  - **Camera ID changes every session** - JRTI generates a new camera hash each time KSP loads. You need to paste the
  new URL into the camera panel each session
  - **Camera only works on the host machine** - the camera feed pulls from your local JRTI server, so viewers watching
  your stream see it through OBS, not by opening the overlay themselves
  - **Time warp** - fast-forwarding in KSP may cause MECO/SECO to not trigger correctly since speed changes happen too
  quickly for the detection window
  - **Kerbin only** - MAX-Q uses Kerbin's atmosphere model and will not calculate correctly on other planets
  - **Node.js required** - the overlay needs a local dev server to run, it cannot be opened as a plain HTML file

---

 ## Feature Requests

  If there is a feature you would like to see added, [open an issue on
  GitHub](https://github.com/ealdr/ksp-x-webcast/issues) with the label **enhancement** and describe:

  - What you want the feature to do
  - Why it would be useful
  - Any examples from real rocket webcasts you are trying to replicate

  All suggestions are welcome.


---
## Thanks to

If you feel generous enough to donate, please donate to the people below who may have a link or something. Without them this wouldn't be possible.
- [JustReadTheInstructions](https://github.com/RELMYMathieu/JustReadTheInstructions) - for serving HullCam feeds in a way the browser can actually consume
- [Telemachus Reborn](https://github.com/TeleIO/Telemachus-1) - the telemetry that makes any of this possible
- [HullcamVDS Continued](https://github.com/linuxgurugamer/HullcamVDSContinued) - the onboard cameras themselves

---

## License

MIT - see [LICENSE](LICENSE).

JRTI is MIT. Telemachus Reborn is MIT. This project communicates with them over the network only and does not link against or redistribute their code.
