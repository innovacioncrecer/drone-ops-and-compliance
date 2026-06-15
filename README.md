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
