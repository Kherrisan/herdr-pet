# Third-party notices

## Bible Strong Avatar Lab

Herdr Pet directly integrates the official procedural avatar exporter and browser runtime from
[Bible Strong Avatar Lab](https://github.com/smontlouis/bible-strong-avatar-lab).

- Copyright: Stéphane Montlouis-Calixte and contributors
- License: GNU Affero General Public License v3.0 only
- Integrated revision: `8207a2d6aad4b8feefce8cccb10687ce0122724d`
- Vendored source: `third-party/avatar-lab/`
- License text: `third-party/avatar-lab/LICENSE`

The official runtime is used to generate and render Avatar Data v1 from the bundled Avatar Studio
Project v2 document. Herdr Pet adds the Tauri integration and Herdr event-to-animation mapping.

Local modification to the vendored runtime:

- `src/features/export/proceduralBrowserRuntime.ts` accepts optional `animationSpeed`, `fps`, and
  `reducedMotion` playback settings. These scale animation/blink timers, cap transition, blink and
  ambient rendering (including Herdr Pet's adaptive idle cap), and reduce ambient movement
  strength. The Controller exposes `setFps()` so adaptive state changes do not destroy and recreate
  the SVG, preserving pose interpolation across animation switches. `pause()` and `stop()` also
  cancel ambient animation frames until playback resumes, so a paused desktop pet is actually still
  and visual captures are deterministic. Near-spherical surfaces with at most 0.1% dimension drift
  are projected as a stable sphere, preventing imported floating-point noise from making their edge
  jump between antialiased pixels during head rotation. Avatar Data and Studio Project formats are
  unchanged.

## Herdr

Herdr Pet communicates with [Herdr](https://github.com/herdr-dev/herdr) through its documented local
protocol and vendors the source for protocol reference and integration fixtures.

- License: Apache License 2.0
- Integrated revision: `d76657f2c7fc18dcce3b9af43842c8afaba1646b`
- Vendored source: `third-party/herdr/`
- License text: `third-party/herdr/LICENSE`
