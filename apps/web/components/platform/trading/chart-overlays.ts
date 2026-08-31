/**
 * Omnira Trading — Atlas overlays as chart primitives.
 *
 * WHY PRIMITIVES AND NOT AN ABSOLUTELY-POSITIONED DIV LAYER
 * ────────────────────────────────────────────────────────
 * A liquidity zone is not decoration. It means "this price band, over this time
 * range", and if it stops meaning that the moment somebody pans the chart, it is
 * worse than not drawing it — an operator would be reading a band that is no
 * longer where the prices are.
 *
 * `ISeriesPrimitive` is the officially supported way to draw inside the chart's
 * own pane. The library calls `updateAllViews()` whenever the viewport changes
 * and then asks the renderer to draw, and the renderer converts its time and
 * price ANCHORS to pixels at that moment through `timeToCoordinate` and
 * `priceToCoordinate`. Alignment is therefore structural: there is no cached
 * pixel value that could survive a pan and be wrong.
 *
 * No private or undocumented API is used. Everything here is `ISeriesPrimitive`,
 * `IPrimitivePaneView`, `IPrimitivePaneRenderer` and the two coordinate
 * converters, all of which are public in v5.
 *
 * PRESENTATION ONLY
 * ─────────────────
 * These primitives receive already-converted `ChartBox` and `ChartMarker`
 * records. They never see `PriceText`, never see `Timestamp`, and never convert
 * anything themselves — the single conversion door is `chart-presentation.ts`.
 */

import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { ChartBox, ChartMarker } from './chart-presentation'

/** How a box should be painted. Resolved from Atlas vocabulary, not by the primitive. */
export interface BoxStyle {
  readonly fill: string
  readonly stroke: string
  readonly label: string
}

export type BoxStyleResolver = (box: ChartBox) => BoxStyle

/** What the primitive needs from the chart to place itself. */
interface Anchors {
  timeToX: (time: Time) => number | null
  priceToY: (price: number) => number | null
}

/** Round to whole device pixels so 1px strokes stay crisp rather than blurred. */
function crisp(value: number): number {
  return Math.round(value) + 0.5
}

// ─── Boxes: liquidity zones and fair value gaps ───────────────────────────────

class BoxRenderer implements IPrimitivePaneRenderer {
  public constructor(
    private readonly boxes: readonly ChartBox[],
    private readonly anchors: Anchors,
    private readonly styleOf: BoxStyleResolver,
  ) {}

  public draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      for (const box of this.boxes) {
        /*
         * Converted HERE, on every frame. A coordinate cached at attach time
         * would be correct exactly once and then silently wrong for the rest of
         * the session.
         */
        const x1 = this.anchors.timeToX(box.fromTime as unknown as Time)
        const x2 = this.anchors.timeToX(box.toTime as unknown as Time)
        const y1 = this.anchors.priceToY(box.upper)
        const y2 = this.anchors.priceToY(box.lower)
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue

        const left = Math.min(x1, x2)
        const right = Math.max(x1, x2)
        const top = Math.min(y1, y2)
        const bottom = Math.max(y1, y2)

        // Entirely off-screen: nothing to draw, and no reason to pay for it.
        if (right < 0 || left > mediaSize.width || bottom < 0 || top > mediaSize.height) {
          continue
        }

        const style = this.styleOf(box)
        // A zero-height band would vanish; a band that exists must be visible.
        const height = Math.max(1, bottom - top)
        const width = Math.max(1, right - left)

        context.fillStyle = style.fill
        context.fillRect(left, top, width, height)

        context.strokeStyle = style.stroke
        context.lineWidth = 1
        context.strokeRect(crisp(left), crisp(top), width, height)

        if (style.label.length > 0 && width > 42) {
          context.fillStyle = style.stroke
          context.font = '10px ui-sans-serif, system-ui, sans-serif'
          context.textBaseline = 'top'
          context.fillText(style.label, left + 5, top + 3)
        }
      }
    })
  }
}

class BoxPaneView implements IPrimitivePaneView {
  public constructor(
    private readonly boxes: readonly ChartBox[],
    private readonly anchors: Anchors,
    private readonly styleOf: BoxStyleResolver,
  ) {}

  /**
   * Beneath the candles.
   *
   * A liquidity band is context for the price action, not a thing that should
   * obscure it. Candles stay readable.
   */
  public zOrder(): PrimitivePaneViewZOrder {
    return 'bottom'
  }

  public renderer(): IPrimitivePaneRenderer | null {
    return new BoxRenderer(this.boxes, this.anchors, this.styleOf)
  }
}

/**
 * A primitive drawing time-and-price anchored boxes.
 *
 * Holds no pixel state at all. `updateAllViews` exists because the interface
 * offers it, and there is deliberately nothing to recompute in it: the views
 * read the anchors and convert on draw, so there is no cache that could go
 * stale between a viewport change and the next frame.
 */
export class BoxPrimitive implements ISeriesPrimitive<Time> {
  private anchors: Anchors = { timeToX: () => null, priceToY: () => null }
  private views: readonly IPrimitivePaneView[] = []

  public constructor(
    private boxes: readonly ChartBox[],
    private readonly styleOf: BoxStyleResolver,
  ) {}

  public attached(param: SeriesAttachedParameter<Time>): void {
    const { chart, series } = param
    this.anchors = {
      timeToX: (time) => chart.timeScale().timeToCoordinate(time),
      priceToY: (price) => series.priceToCoordinate(price),
    }
    this.rebuild()
  }

  public detached(): void {
    this.anchors = { timeToX: () => null, priceToY: () => null }
    this.views = []
  }

  /** Replace the drawn set without tearing down the primitive. */
  public setBoxes(boxes: readonly ChartBox[]): void {
    this.boxes = boxes
    this.rebuild()
  }

  private rebuild(): void {
    this.views = [new BoxPaneView(this.boxes, this.anchors, this.styleOf)]
  }

  public updateAllViews(): void {
    // Nothing cached, nothing to invalidate — see the class comment.
  }

  public paneViews(): readonly IPrimitivePaneView[] {
    return this.views
  }
}

// ─── Manipulation markers ─────────────────────────────────────────────────────

export interface MarkerStyle {
  readonly fill: string
  readonly text: string
}

class MarkerRenderer implements IPrimitivePaneRenderer {
  public constructor(
    private readonly markers: readonly ChartMarker[],
    private readonly anchors: Anchors,
    private readonly style: MarkerStyle,
  ) {}

  public draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      for (const marker of this.markers) {
        const x = this.anchors.timeToX(marker.time as unknown as Time)
        const y = this.anchors.priceToY(marker.price)
        if (x === null || y === null) continue
        if (x < -40 || x > mediaSize.width + 40) continue

        /*
         * Bound to the marker's own instant and price. A sweep of the highs
         * points down at the level it swept and sits above it; a sweep of the
         * lows is the mirror. Both move with the chart because both are drawn
         * from converted anchors.
         */
        const tipY = marker.above ? y - 9 : y + 9
        const baseY = marker.above ? tipY - 10 : tipY + 10

        context.fillStyle = this.style.fill
        context.beginPath()
        context.moveTo(x, tipY)
        context.lineTo(x - 6, baseY)
        context.lineTo(x + 6, baseY)
        context.closePath()
        context.fill()

        context.fillStyle = this.style.text
        context.font = '10px ui-sans-serif, system-ui, sans-serif'
        context.textAlign = 'center'
        context.textBaseline = marker.above ? 'bottom' : 'top'
        context.fillText(marker.label, x, marker.above ? baseY - 3 : baseY + 3)
        context.textAlign = 'start'
      }
    })
  }
}

class MarkerPaneView implements IPrimitivePaneView {
  public constructor(
    private readonly markers: readonly ChartMarker[],
    private readonly anchors: Anchors,
    private readonly style: MarkerStyle,
  ) {}

  /** Above the candles: a sweep marker is meant to be noticed. */
  public zOrder(): PrimitivePaneViewZOrder {
    return 'top'
  }

  public renderer(): IPrimitivePaneRenderer | null {
    return new MarkerRenderer(this.markers, this.anchors, this.style)
  }
}

export class MarkerPrimitive implements ISeriesPrimitive<Time> {
  private anchors: Anchors = { timeToX: () => null, priceToY: () => null }
  private views: readonly IPrimitivePaneView[] = []

  public constructor(
    private markers: readonly ChartMarker[],
    private readonly style: MarkerStyle,
  ) {}

  public attached(param: SeriesAttachedParameter<Time>): void {
    const { chart, series } = param
    this.anchors = {
      timeToX: (time) => chart.timeScale().timeToCoordinate(time),
      priceToY: (price) => series.priceToCoordinate(price),
    }
    this.rebuild()
  }

  public detached(): void {
    this.anchors = { timeToX: () => null, priceToY: () => null }
    this.views = []
  }

  public setMarkers(markers: readonly ChartMarker[]): void {
    this.markers = markers
    this.rebuild()
  }

  private rebuild(): void {
    this.views = [new MarkerPaneView(this.markers, this.anchors, this.style)]
  }

  public updateAllViews(): void {
    // Nothing cached.
  }

  public paneViews(): readonly IPrimitivePaneView[] {
    return this.views
  }
}
