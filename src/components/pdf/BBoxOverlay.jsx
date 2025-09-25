
import React, { Fragment, useState } from 'react'
import { Page } from 'react-pdf'

export const SCALE_BASE = 1000

const toNumber = (value) => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length === 0) return NaN
    return Number(trimmed)
  }
  return Number(value)
}

export const clampToScale = (value) => {
  const numeric = toNumber(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(Math.max(numeric, 0), SCALE_BASE)
}

export const normalizeBBox = (bbox) => {
  if (!Array.isArray(bbox) || bbox.length < 4) {
    return { xmin: 0, ymin: 0, xmax: 0, ymax: 0, width: 0, height: 0, valid: false }
  }

  const xminRaw = clampToScale(bbox[0])
  const yminRaw = clampToScale(bbox[1])
  const xmaxRaw = clampToScale(bbox[2])
  const ymaxRaw = clampToScale(bbox[3])

  const xmin = Math.min(xminRaw, xmaxRaw)
  const ymin = Math.min(yminRaw, ymaxRaw)
  const xmax = Math.max(xminRaw, xmaxRaw)
  const ymax = Math.max(yminRaw, ymaxRaw)
  const width = Math.max(0, xmax - xmin)
  const height = Math.max(0, ymax - ymin)

  return { xmin, ymin, xmax, ymax, width, height, valid: width > 0 && height > 0 }
}

export const normalizeBBoxForScale = normalizeBBox

export const projectBBoxToMetrics = (bbox, metrics) => {
  if (!metrics) return null
  const { renderWidth, renderHeight, offsetX = 0, offsetY = 0 } = metrics
  if (!renderWidth || !renderHeight) return null

  const normalized = normalizeBBox(bbox)
  if (!normalized.valid) return null

  const scaleX = renderWidth / SCALE_BASE
  const scaleY = renderHeight / SCALE_BASE

  return {
    x: offsetX + normalized.xmin * scaleX,
    y: offsetY + normalized.ymin * scaleY,
    width: Math.max(1, normalized.width * scaleX),
    height: Math.max(1, normalized.height * scaleY)
  }
}

export const projectBBoxToRenderRect = projectBBoxToMetrics

export const metricsFromViewport = (viewport, overrides = {}) => {
  if (!viewport) return null
  const renderWidth = overrides.renderWidth ?? viewport.renderedWidth ?? viewport.width ?? 0
  const renderHeight = overrides.renderHeight ?? viewport.renderedHeight ?? viewport.height ?? 0

  if (!renderWidth || !renderHeight) return null

  return {
    renderWidth,
    renderHeight,
    offsetX: overrides.offsetX ?? 0,
    offsetY: overrides.offsetY ?? 0
  }
}

const DEFAULT_TYPE_COLORS = {
  text: '#ef476f',
  paragraph: '#ef476f',
  title: '#ffd166',
  table: '#06d6a0',
  figure: '#118ab2',
  image: '#118ab2',
  header: '#073b4c'
}

const defaultColorGetter = (block) => DEFAULT_TYPE_COLORS[block?.type] || '#ff6b6b'
const defaultLabelGetter = (block) => block?.type || block?.id || 'block'

export const BBoxRect = ({
  block,
  viewport,
  metrics,
  getColor = defaultColorGetter,
  getLabel = defaultLabelGetter,
  interactive = false,
  style,
  renderContent
}) => {
  const effectiveMetrics = metrics || metricsFromViewport(viewport)
  if (!effectiveMetrics) return null

  const rect = projectBBoxToMetrics(block?.bbox, effectiveMetrics)
  if (!rect) return null

  const color = getColor(block)
  const label = getLabel(block)
  const pointerEvents = interactive ? 'auto' : 'none'

  const baseStyle = {
    position: 'absolute',
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    border: `2px solid ${color}`,
    backgroundColor: `${color}22`,
    borderRadius: '3px',
    boxSizing: 'border-box',
    pointerEvents
  }

  const content = renderContent
    ? renderContent({ block, rect, color, label, metrics: effectiveMetrics })
    : (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: -18,
            padding: '2px 6px',
            borderRadius: '3px',
            backgroundColor: color,
            color: '#fff',
            fontSize: '11px',
            fontWeight: 500,
            pointerEvents: 'none'
          }}
        >
          {label}
        </div>
      )

  return (
    <div style={{ ...baseStyle, ...style }}>
      {content}
    </div>
  )
}

export const BBoxLayer = ({
  blocks = [],
  viewport,
  metrics,
  getColor,
  getLabel,
  renderBox,
  interactive = false,
  style,
  ...rest
}) => {
  const effectiveMetrics = metrics || metricsFromViewport(viewport)
  if (!effectiveMetrics || !blocks.length) return null

  const layerStyle = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: effectiveMetrics.renderWidth,
    height: effectiveMetrics.renderHeight,
    pointerEvents: interactive ? 'auto' : 'none',
    ...style
  }

  return (
    <div style={layerStyle} {...rest}>
      {blocks.map((block, index) => {
        const key = block?.bboxid || block?.id || `${block?.type || 'block'}_${index}`
        if (renderBox) {
          const element = renderBox({ block, viewport, metrics: effectiveMetrics, index })
          if (React.isValidElement(element)) {
            return React.cloneElement(element, { key })
          }
          return <Fragment key={key}>{element}</Fragment>
        }
        return (
          <BBoxRect
            key={key}
            block={block}
            viewport={viewport}
            metrics={effectiveMetrics}
            getColor={getColor}
            getLabel={getLabel}
            interactive={interactive}
          />
        )
      })}
    </div>
  )
}

const DEFAULT_WRAPPER_STYLE = {
  position: 'relative',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px'
}

const DEFAULT_CONTAINER_STYLE = {
  position: 'relative',
  display: 'inline-block',
  backgroundColor: '#fff',
  boxShadow: '0 1px 6px rgba(0,0,0,0.12)',
  borderRadius: '4px'
}

const defaultTitleRenderer = ({ pageNumber }) => `Page ${pageNumber}`

export const PDFPageView = ({
  pageNumber,
  width,
  blocks = [],
  getBoxColor,
  getBoxLabel,
  renderBox,
  wrapperStyle,
  containerStyle,
  wrapperProps = {},
  containerProps = {},
  layerProps = {},
  title,
  titleRenderer,
  showTitle = true,
  pageProps = {},
  onViewportReady,
  renderOverlay
}) => {
  const [viewport, setViewport] = useState(null)

  const { style: wrapperPropsStyle, ...restWrapperProps } = wrapperProps || {}
  const { style: containerPropsStyle, ...restContainerProps } = containerProps || {}

  const {
    metrics: overrideMetrics,
    style: layerStyle,
    interactive: layerInteractive,
    getColor: layerGetColor,
    getLabel: layerGetLabel,
    renderBox: layerRenderBox,
    ...restLayerProps
  } = layerProps || {}

  const {
    onLoadSuccess: pageOnLoadSuccess,
    renderAnnotationLayer = false,
    renderTextLayer = true,
    ...restPageProps
  } = pageProps

  const handlePageLoad = (page) => {
    const baseViewport = page.getViewport({ scale: 1, useCropBox: true })
    const targetWidth = width || baseViewport.width
    const scale = targetWidth / baseViewport.width
    const targetHeight = baseViewport.height * scale

    const viewportInfo = {
      originalWidth: baseViewport.width,
      originalHeight: baseViewport.height,
      renderedWidth: targetWidth,
      renderedHeight: targetHeight,
      scale
    }

    setViewport(viewportInfo)
    onViewportReady?.(viewportInfo, page)
    pageOnLoadSuccess?.(page)
  }

  const metrics = overrideMetrics || metricsFromViewport(viewport)
  const overlayContent = metrics && renderOverlay ? renderOverlay({ viewport, metrics, pageNumber }) : null
  const effectiveGetColor = layerGetColor || getBoxColor
  const effectiveGetLabel = layerGetLabel || getBoxLabel
  const effectiveRenderBox = renderBox || layerRenderBox

  const containerWidthValue = viewport?.renderedWidth ?? width ?? 'auto'
  const resolvedContainerStyle = {
    ...DEFAULT_CONTAINER_STYLE,
    width: typeof containerWidthValue === 'number' ? `${containerWidthValue}px` : containerWidthValue,
    ...containerStyle,
    ...containerPropsStyle
  }

  const resolvedWrapperStyle = {
    ...DEFAULT_WRAPPER_STYLE,
    ...wrapperStyle,
    ...wrapperPropsStyle
  }

  const titleContent = title ?? (titleRenderer || defaultTitleRenderer)({ pageNumber, viewport })

  return (
    <div style={resolvedWrapperStyle} {...restWrapperProps}>
      {showTitle && (typeof titleContent === 'function' ? titleContent({ pageNumber, viewport }) : titleContent)}
      <div style={resolvedContainerStyle} {...restContainerProps}>
        <Page
          pageNumber={pageNumber}
          width={width}
          renderAnnotationLayer={renderAnnotationLayer}
          renderTextLayer={renderTextLayer}
          onLoadSuccess={handlePageLoad}
          {...restPageProps}
        />
        {metrics && (
          <BBoxLayer
            blocks={blocks}
            viewport={viewport}
            metrics={metrics}
            getColor={effectiveGetColor}
            getLabel={effectiveGetLabel}
            renderBox={effectiveRenderBox && ((args) => effectiveRenderBox({ ...args, pageNumber }))}
            interactive={layerInteractive}
            style={layerStyle}
            {...restLayerProps}
          />
        )}
        {overlayContent}
      </div>
    </div>
  )
}
