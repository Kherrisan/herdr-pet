import { Pause, Play, Square } from 'lucide-react'
import { motion } from 'motion/react'
import { useId } from 'react'

import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useStudioLanguage } from '@/i18n'

import { type PlaybackStatus } from '@/app/studio-utils'
import { type SnapshotBackground } from '@/features/export/snapshotExporter'
import { type RenderedColors, type RenderedScene } from '@/features/rendering/renderedScene'
export function ControlSection({
  title,
  subtitle,
  compact = false,
  children,
}: {
  title: string
  subtitle: string
  compact?: boolean
  children: React.ReactNode
}) {
  const { t } = useStudioLanguage()
  return (
    <section className={`control-section${compact ? ' control-section-compact' : ''}`}>
      <header className="control-section-header">
        <h2>{t(title)}</h2>
        <p>{t(subtitle)}</p>
      </header>
      <Separator className="control-section-separator" />
      <div className="control-section-content">{children}</div>
    </section>
  )
}

export function SnapshotPreview({
  scene,
  colors,
  background,
  colorFrom,
  colorTo,
}: {
  scene: RenderedScene
  colors: RenderedColors
  background: SnapshotBackground
  colorFrom: string
  colorTo: string
}) {
  const id = useId().replace(/:/g, '')
  const clipId = `${id}-clip`
  const linearId = `${id}-linear`
  const radialId = `${id}-radial`
  const backgroundFill =
    background === 'solid'
      ? colorFrom
      : background === 'linear'
        ? `url(#${linearId})`
        : `url(#${radialId})`

  return (
    <div className={`snapshot-preview ${background === 'transparent' ? 'is-transparent' : ''}`}>
      <svg viewBox="-150 -150 300 300" aria-hidden="true">
        <defs>
          <clipPath id={clipId}>
            <motion.path d={scene.headPath} />
          </clipPath>
          <linearGradient id={linearId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={colorFrom} />
            <stop offset="1" stopColor={colorTo} />
          </linearGradient>
          <radialGradient id={radialId} cx="50%" cy="42%" r="70%">
            <stop offset="0" stopColor={colorFrom} />
            <stop offset="1" stopColor={colorTo} />
          </radialGradient>
        </defs>
        {background !== 'transparent' && (
          <rect x="-150" y="-150" width="300" height="300" fill={backgroundFill} />
        )}
        <motion.g style={{ x: scene.offsetX, y: scene.offsetY }}>
          {scene.backPaths.map((pathValue, index) => (
            <motion.path d={pathValue} fill={colors.body} key={`back-${index}`} />
          ))}
          <motion.path d={scene.headPath} fill={colors.body} />
          <g clipPath={`url(#${clipId})`}>
            <motion.path d={scene.leftPath} fill={colors.eyes} opacity={scene.leftOpacity} />
            <motion.path d={scene.rightPath} fill={colors.eyes} opacity={scene.rightOpacity} />
          </g>
          {scene.frontPaths.map((pathValue, index) => (
            <motion.path d={pathValue} fill={colors.body} key={`front-${index}`} />
          ))}
        </motion.g>
      </svg>
    </div>
  )
}

export function ExportSection({
  value,
  title,
  subtitle,
  children,
}: {
  value: string
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  const { t } = useStudioLanguage()
  return (
    <AccordionItem value={value} className={`export-accordion-item export-accordion-${value}`}>
      <AccordionTrigger className="export-accordion-trigger">
        <span>
          <strong>{t(title)}</strong>
          <small>{t(subtitle)}</small>
        </span>
      </AccordionTrigger>
      <AccordionContent className="export-accordion-content">
        <div className="export-accordion-inner">{children}</div>
      </AccordionContent>
    </AccordionItem>
  )
}

export function InspectorCard({ className, ...props }: React.ComponentProps<typeof Card>) {
  return <Card className={`panel${className ? ` ${className}` : ''}`} {...props} />
}

export function StatePlayer({
  name,
  status,
  onToggle,
  onStop,
}: {
  name: string | null
  status: PlaybackStatus
  onToggle: () => void
  onStop: () => void
}) {
  const { t } = useStudioLanguage()
  if (!name) return null
  const statusLabel =
    status === 'playing' ? 'En lecture' : status === 'paused' ? 'En pause' : 'Arrêté'
  return (
    <div className="state-player" aria-label={`${t(statusLabel)} : ${name}`}>
      <PlaybackIdentity name={name} status={status} />
      <Button
        variant="secondary"
        size="icon-sm"
        aria-label={t(status === 'playing' ? `Mettre ${name} en pause` : `Reprendre ${name}`)}
        onClick={onToggle}
      >
        {status === 'playing' ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={t(`Arrêter ${name}`)} onClick={onStop}>
        <Square fill="currentColor" />
      </Button>
    </div>
  )
}

export function PlaybackIdentity({ name, status }: { name: string; status: PlaybackStatus }) {
  const { t } = useStudioLanguage()
  const statusLabel =
    status === 'playing' ? 'En lecture' : status === 'paused' ? 'En pause' : 'Arrêté'
  return (
    <span className={`playback-identity is-${status}`}>
      <i />
      <span>
        <small>{t(statusLabel)}</small>
        <strong>{name}</strong>
      </span>
    </span>
  )
}

export function PanelTitle({
  title,
  subtitle,
  level = 2,
}: {
  title: string
  subtitle: string
  level?: 2 | 3
}) {
  const { t } = useStudioLanguage()
  const Heading = level === 3 ? 'h3' : 'h2'
  return (
    <CardHeader className="panel-title">
      <CardTitle as={Heading}>{t(title)}</CardTitle>
      <CardDescription>{t(subtitle)}</CardDescription>
    </CardHeader>
  )
}
