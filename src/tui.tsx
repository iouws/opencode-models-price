import { Plugin } from "@opencode/plugin/tui"
import type { ModelInfo } from "@opencode/client"
import type { BoxRenderable, Renderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"

type Price = {
  readonly free: boolean
  readonly input: string
  readonly output: string
  readonly width: number
}

type Measurement = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly contentRight: number
  readonly sessionID?: string
}

function formatMoney(value: number) {
  if (!Number.isFinite(value) || value === 0) return "$0"
  if (value >= 1) return `$${Number(value.toFixed(2))}`
  if (value >= 0.1) return `$${value.toFixed(2)}`
  if (value >= 0.001) return `$${value.toFixed(3)}`
  return `$${value.toPrecision(2)}`
}

function formatSize(value: number) {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}k`
  return String(value)
}

function findModel(context: Plugin.Context, sessionID?: string) {
  const selected = context.ui.model.current()
  if (!selected) return undefined
  const session = sessionID ? context.data.session.get(sessionID) : undefined
  const location = session?.location ?? context.location ?? context.data.location.default()
  const models = context.data.location.model.list(location) ?? []
  return models.find(
    (model) =>
      model.providerID === selected.providerID &&
      (model.modelID === selected.modelID || model.id === selected.modelID),
  )
}

function modelPrice(model: ModelInfo | undefined): Price | undefined {
  const cost = model?.cost[0]
  if (!model || !cost) return undefined
  const input = formatMoney(cost.input)
  const output = formatMoney(cost.output)
  const free = cost.input === 0 && cost.output === 0
  const text = free ? "free" : `in ${input} · out ${output} /M`
  return { free, input, output, width: text.length }
}

function costLines(model: ModelInfo) {
  if (model.cost.length === 0) return ["No pricing is published for this model."]
  return model.cost.flatMap((cost, index) => {
    const heading = cost.tier
      ? `Tier ${index + 1} · context over ${formatSize(cost.tier.size)} tokens`
      : `Tier ${index + 1} · base rate`
    return [
      heading,
      `  input        ${formatMoney(cost.input)} / 1M tokens`,
      `  output       ${formatMoney(cost.output)} / 1M tokens`,
      `  cache read   ${formatMoney(cost.cache.read)} / 1M tokens`,
      `  cache write  ${formatMoney(cost.cache.write)} / 1M tokens`,
      ...(index === model.cost.length - 1 ? [] : [""]),
    ]
  })
}

function showPricing(context: Plugin.Context, sessionID?: string) {
  const model = findModel(context, sessionID)
  if (!model) {
    context.ui.toast.show({ message: "No pricing available for the selected model", variant: "warning" })
    return
  }
  void context.ui.dialog.alert({
    title: `${model.name} pricing`,
    message: [`Provider: ${model.providerID}`, "", ...costLines(model), "", "Prices are in USD per 1M tokens."].join(
      "\n",
    ),
  })
}

function PriceTag(props: { context: Plugin.Context; sessionID?: string; separator?: boolean }) {
  const [hovered, setHovered] = createSignal(false)
  const price = createMemo(() => modelPrice(findModel(props.context, props.sessionID)))
  const theme = props.context.theme

  return (
    <Show when={price()}>
      {(value) => (
        <box
          flexShrink={0}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
          onMouseUp={() => showPricing(props.context, props.sessionID)}
        >
          <text wrapMode="none">
            <Show when={props.separator}>
              <span style={{ fg: theme.text.muted }}> · </span>
            </Show>
            <Show
              when={!value().free}
              fallback={<span style={{ fg: theme.text.feedback.success.base }}>free</span>}
            >
              <span style={{ fg: hovered() ? theme.text.base : theme.text.muted }}>in </span>
              <span style={{ fg: theme.text.base }}>{value().input}</span>
              <span style={{ fg: hovered() ? theme.text.base : theme.text.muted }}> · out </span>
              <span style={{ fg: theme.text.base }}>{value().output}</span>
              <span style={{ fg: hovered() ? theme.text.base : theme.text.muted }}> /M</span>
            </Show>
          </text>
        </box>
      )}
    </Show>
  )
}

function absoluteLeft(node: Renderable) {
  let value = 0
  let current: Renderable | null | undefined = node
  while (current) {
    value += current.getLayout().left
    current = current.parent
  }
  return value
}

function absoluteTop(node: Renderable) {
  let value = 0
  let current: Renderable | null | undefined = node
  while (current) {
    value += current.getLayout().top
    current = current.parent
  }
  return value
}

function isText(node: Renderable) {
  const chunks = (node as { chunks?: unknown }).chunks
  return Array.isArray(chunks)
}

function textRight(node: Renderable) {
  let right = 0
  const visit = (item: Renderable) => {
    const layout = item.getLayout()
    if (layout.width > 0 && isText(item)) right = Math.max(right, absoluteLeft(item) + layout.width)
    for (const child of item.getChildren()) visit(child)
  }
  visit(node)
  return right
}

/**
 * The model row above the prompt has no public slot. Measure it from the
 * footer row and let the app slot draw the price at its right edge.
 */
function findMetadataRow(root: Renderable, top: number) {
  let match: Renderable | undefined
  const visit = (node: Renderable) => {
    const layout = node.getLayout()
    if (layout.height === 1 && layout.width > 20 && absoluteTop(node) === top) {
      if (!match || layout.width > match.getLayout().width) match = node
    }
    for (const child of node.getChildren()) visit(child)
  }
  visit(root)
  return match
}

function MetadataProbe(props: {
  sessionID?: string
  width: number
  onMeasure: (measurement: Measurement | undefined) => void
}) {
  let node: BoxRenderable | undefined
  const dimensions = useTerminalDimensions()
  let last = ""

  const update = () => {
    if (!node) return
    const footer = node.parent
    const container = footer?.parent
    if (!footer || !container) return
    const top = absoluteTop(footer) - 2
    const row = findMetadataRow(container, top)
    if (!row) {
      if (last !== "none") {
        last = "none"
        props.onMeasure(undefined)
      }
      return
    }
    const layout = row.getLayout()
    const left = absoluteLeft(row)
    const contentRight = textRight(row)
    const key = `${left}:${top}:${layout.width}:${contentRight}:${props.width}:${props.sessionID ?? ""}`
    if (key === last) return
    last = key
    props.onMeasure({
      left,
      top,
      width: layout.width,
      contentRight,
      sessionID: props.sessionID,
    })
  }

  createEffect(() => {
    props.width
    dimensions()
    update()
  })
  const timer = setInterval(update, 500)
  onCleanup(() => {
    clearInterval(timer)
    props.onMeasure(undefined)
  })

  return (
    <box
      height={0}
      ref={(value) => {
        node = value
        update()
      }}
    />
  )
}

function fits(measurement: Measurement | undefined, price: Price | undefined, extra = 0) {
  if (!measurement || !price) return false
  const content = measurement.contentRight - measurement.left
  if (content <= 0) return false
  return measurement.width - content >= price.width + extra + 2
}

export default Plugin.define({
  id: "models-price.tui",
  setup(context) {
    const [measurement, setMeasurement] = createSignal<Measurement>()

    context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => {
        const price = createMemo(() => modelPrice(findModel(context, input.sessionID)))
        const dimensions = useTerminalDimensions()
        const measured = () => {
          const value = measurement()
          return value?.sessionID === input.sessionID ? value : undefined
        }
        const measuredFits = () => fits(measured(), price(), 3)
        return (
          <>
            <Show when={price()}>
              <MetadataProbe sessionID={input.sessionID} width={price()!.width} onMeasure={setMeasurement} />
            </Show>
            <Show when={!measuredFits() && dimensions().width >= 80}>
              <PriceTag context={context} sessionID={input.sessionID} />
            </Show>
          </>
        )
      },
    })

    context.ui.slot({
      append: "app",
      render: () => {
        const overlay = () => {
          const value = measurement()
          if (!value) return undefined
          const route = context.ui.router.current()
          if (route.type !== "session" || route.sessionID !== value.sessionID) return undefined
          const price = modelPrice(findModel(context, value.sessionID))
          if (!fits(value, price, 3)) return undefined
          return { ...value, priceWidth: price!.width + 3 }
        }
        return (
          <Show when={overlay()}>
            {(value) => (
              <box
                position="absolute"
                left={value().left + value().width - value().priceWidth - 1}
                top={value().top}
                width={value().priceWidth + 1}
                height={1}
                zIndex={1000}
                paddingRight={1}
              >
                <PriceTag context={context} sessionID={value().sessionID} separator />
              </box>
            )}
          </Show>
        )
      },
    })

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "models-price.show",
          title: "Show selected model pricing",
          group: "Models",
          palette: true,
          slash: { name: "price" },
          run: () => showPricing(context),
        },
      ],
    }))
  },
})
