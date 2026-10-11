<a href="https://github.com/innovacioncrecer/drone-ops-and-compliance">
  <img src="./.github/assets/livekit-mark.png" alt="DroneOps logo" width="100" height="100">
</a>

# DroneOps and Communications

<p>
  <a href="https://github.com/innovacioncrecer/drone-ops-and-compliance"><strong>View on GitHub</strong></a>
  •
  <a href="https://docs.livekit.io/">LiveKit Docs</a>
</p>

<br>

DroneOps and Communications is a platform for real-time video conferencing and drone operations management, built on [LiveKit Components](https://github.com/livekit/components-js), [LiveKit Cloud](https://cloud.livekit.io/), and Next.js.

## Tech Stack

- This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).
- App is built with [@livekit/components-react](https://github.com/livekit/components-js/) library.

## Demo

Source code available at https://github.com/innovacioncrecer/drone-ops-and-compliance.

## Dev Setup

Steps to get a local dev setup up and running:

1. Run `pnpm install` to install all dependencies.
2. Copy `.env.example` in the project root and rename it to `.env.local`.
3. Update the missing environment variables in the newly created `.env.local` file.
4. Run `pnpm dev` to start the development server and visit [http://localhost:3000](http://localhost:3000) to see the result.
5. Start development 🎉

## Docker Deployment

The portal and DOCO agent are packaged as two separate Docker images. They can be
combined in one image, but separate images are preferred because the portal is an
HTTP service while the agent is a LiveKit worker. This lets each service restart,
scale, and receive environment variables independently.

Build the portal image:

```bash
docker build -t droneops-portal:local .
```

Build the agent image:

```bash
docker build -t doco-agent:local ./agent
```

Run both services together:

```bash
docker compose up --build
```

The portal reads `.env.local` and persists file-backed admin data in `./data`.
The agent reads `agent/.env.local` and writes transcripts to
`./agent/transcripts`.

## PWA Installation

Serve the portal over HTTPS (localhost is allowed for development). The manifest,
`/sw.js`, `/offline.html`, and `/pwa/180`, `/pwa/192`, `/pwa/512` must remain public.
The installation control is available before and after login, and is hidden when
running in standalone mode. Chromium shows its native installation prompt when
eligible; Safari on iPhone/iPad uses Share > Add to Home Screen. Browser eligibility,
previous dismissals, and existing installations affect whether a prompt is offered.

The service worker caches only the static offline page, never authenticated pages,
API responses, recording URLs, or media. Calls still require Internet. Updates do
not force reloads during calls. Keep `AUTH_SECRET` stable across deployments to
preserve existing sessions.

Both call views integrate supported Audio Session and Media Session APIs. Installing
the PWA does not guarantee microphone capture with the screen locked: the browser
and mobile OS can suspend it. Verify on real target devices; continuous background
calling may require a native app with the platform's audio background capabilities.

## Recording Gallery

The admin recording gallery groups videos by the viewer's local calendar day.
Opening a recording shows its video and transcript in a dedicated dialog. Transcript
timestamps can seek the video; matching uses the room name and recording interval.
Video previews load as their cards enter the viewport. Spaces must allow browser
video playback and byte-range requests; signed links can be renewed in the viewer.

The portal first reads matching rows from the existing `Transcript` database table.
DOCO also writes timestamped `.jsonl` transcripts alongside its Markdown files.
Docker Compose mounts that directory read-only in the portal through `TRANSCRIPTS_DIR`.
When portal and agent run on separate servers, mount the same persistent storage
at `TRANSCRIPTS_DIR` for both, or populate the database transcript table. Agent-local
files are not automatically available to a separately deployed portal.

Historical Markdown-only transcripts are not imported automatically. Recordings
with no matching transcript or no reliable room/start time show an unavailable
state. DOCO transcripts cover the turns captured by the agent, not a guaranteed
verbatim transcription of every participant. Timestamps reflect when turns were
recorded and are approximate seek points, not word-aligned captions.
