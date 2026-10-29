# OpenCode Models Price

[![OpenCode 2.2.1+](https://img.shields.io/badge/OpenCode-2.2.1%2B-blue)](https://opencode.ai/v2/docs/)

A tiny TUI plugin for [OpenCode](https://opencode.ai) that shows the selected
model's price right next to its name:

```text
Build · DeepSeek V4.1 Flash OpenCode Go · high        · in $0.15 · out $0.60 /M
```

## Features

- **Input/output price** in USD per 1M tokens, taken from the OpenCode model
  catalog.
- **`free`** badge for models with zero cost.
- **Full rate card on click**: input, output, cache read, cache write, and every
  tier level.
- **`/price`** slash command and a command-palette entry.
- **Adapts to the terminal width**: the price moves to the footer row when the
  model line is too narrow, and hides on very small terminals.

## Placement

The price sits in the prompt metadata row, to the right of the model variant
(`high`, `medium`, ...). OpenCode has no public slot for that row, so the plugin
measures it through the layout tree and draws a small absolute overlay.

When the row is too narrow (for example an 80-column terminal) or the model name
takes almost all the width, the price automatically moves to the footer row next
to the current directory. On very narrow terminals it is hidden; `/price` still
opens the rate card.

## Install

Clone the repository anywhere:

```powershell
git clone https://github.com/iouws/opencode-models-price
cd opencode-models-price
npm install
```

Register the absolute path in `~/.config/opencode/cli.json`:

```json
{
  "plugins": [
    "C:/path/to/opencode-models-price"
  ]
}
```

Restart the TUI or run `/reload` after changing the config.

`npm install` is only needed for development and type checking. At runtime the
plugin uses the host's `@opencode/plugin`, `@opentui/core`, `@opentui/solid` and
`solid-js`, so the repository itself does not need to ship `node_modules`.

The empty server half in `src/index.ts` exists so a single plugin entrypoint can
load the TUI part. All logic lives in `src/tui.tsx`.

## Usage

- Click the price to open the full rate card.
- Run `/price`, or pick **Show selected model pricing** from the command
  palette.
- The price updates automatically when you switch models or providers.

## Pricing data

Prices come from `ModelInfo.cost` in the OpenCode model catalog and are shown in
USD per 1M tokens. If a model has several tiers, the inline label uses the base
tier and the dialog lists every tier with its context threshold.

## Development

```powershell
npm install
npm run typecheck
```
