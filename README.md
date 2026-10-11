# Choreo

**Present your story, in scroll motion.**

Choreo is a scroll-driven presentation studio. Instead of a stack of identical
slides that all change at once, a presentation is one continuous scroll track
divided into named _phases_. Every component carries its own path through
space, so the same scroll gesture that moves the story forward also drives the
choreography.

## Ideas behind it

- **Phases, not slides.** A presentation is a single scroll track. Phases are
  named places along it, used for navigation, stop points and export. They
  don't own the motion.
- **Independent choreography.** Each component has its own keyframes, placed
  wherever it needs them. Nothing has to enter, exit or move in step with
  anything else.
- **Presentation as code.** Each presentation is a folder on disk: React
  components, one `presentation.json`, and an assets folder. It's readable,
  diffable and git-friendly.
- **Spatial, not flat.** Motion uses CSS transforms with perspective, so
  rotation and depth feel real without a WebGL pipeline.

## What you can do

- Describe a presentation in plain language and have Choreo design it, then
  review every proposed change before it's applied.
- Refine individual components by asking for changes or editing the code
  directly.
- Add images, video, data files and links as assets.
- Present full screen with arrow-key stops, auto-play and looping.
- Export a PDF with one page per stop point.

## Getting started

Requirements: Node.js, plus Google Chrome for PDF export.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then add your Anthropic
API key in **Settings** (or put `ANTHROPIC_API_KEY` in `.env`). The
**Quarterly Vision** demo is included to explore.

| Command             | What it does         |
| ------------------- | -------------------- |
| `npm run dev`       | Start the dev server |
| `npm run build`     | Build for production |
| `npm run typecheck` | Check types          |
| `npm test`          | Run the test suite   |

## Built with

TanStack Start, React, Tailwind CSS, Zustand, Zod, the Anthropic TypeScript
SDK, and Playwright for PDF export.

## Author

Created by David Bender
david@brickgraph.io
