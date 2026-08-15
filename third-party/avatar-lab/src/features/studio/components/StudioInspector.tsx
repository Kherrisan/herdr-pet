import {
  ArrowLeft,
  Copy,
  Download,
  FileCode2,
  Move3D,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Smile,
  Trash2,
  Upload,
} from 'lucide-react'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react'

import { Accordion } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Field, FieldTitle } from '@/components/ui/field'
import { Drawer } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'

import {
  ControlSection,
  ExportSection,
  InspectorCard,
  PanelTitle,
  SnapshotPreview,
  StatePlayer,
} from '@/app/components/common'
import { ColorField, LinkButton, NumericField } from '@/app/components/controls'
import { formatSeconds, scaleSurface, type Side, type SnapshotFormat } from '@/app/studio-utils'
import { SequenceWorkspace } from '@/features/animation/components/SequenceWorkspace'
import { findExpressionIndex, groupSequences } from '@/features/animation/sequences'
import { defaultAvatarEyes } from '@/features/avatar/avatars'
import { bodyPrimitiveTypes, MAX_BODY_NODES } from '@/features/avatar/body'
import {
  ExpressionCard,
  ExpressionPreview,
  ExpressionWorkspace,
  SurfaceThumbnail,
} from '@/features/avatar/components/ExpressionWorkspace'
import { defaultExpression } from '@/features/avatar/presets'
import { surfaceLabels, surfacePresets } from '@/features/avatar/surfaces'
import { type SnapshotBackground } from '@/features/export/snapshotExporter'
import { AvatarPage } from '@/features/studio/components/AvatarDrawer'
import { StudioIdentity } from '@/features/studio/components/StudioIdentity'
import type { StudioController } from '@/features/studio/useStudioController'

export function StudioInspector({ controller }: { controller: StudioController }) {
  const {
    activateAvatar,
    activeAvatar,
    activeAvatarEyes,
    activeAvatarId,
    activeExpression,
    activeSequence,
    activeSequenceLabel,
    activeState,
    addBodyNode,
    avatarDragOrigin,
    avatarDragPreview,
    avatars,
    avatarsRef,
    blink,
    bodyEditing,
    bodyNodes,
    cancelAvatarEditing,
    cancelAvatarMove,
    cancelExpressionEditing,
    cancelExpressionMove,
    cancelSequenceEditing,
    cancelStateMove,
    commitAvatarMove,
    commitExpressionMove,
    commitStateMove,
    createNewAvatar,
    deleteSelectedBodyNode,
    downloadAvatarExport,
    downloadStudioProject,
    draggedAvatarId,
    draggedExpressionId,
    draggedStateId,
    draggingAvatarId,
    draggingExpressionId,
    draggingStateId,
    duplicateAvatar,
    duplicateExpression,
    duplicateSelectedBodyNode,
    duplicateSequenceEditing,
    duplicateState,
    editing,
    editorPageOpen,
    exportAnimationIdSet,
    exportFormat,
    expression,
    expressionById,
    expressionDragOrigin,
    expressionDragPreview,
    expressions,
    focusAvatarName,
    language,
    launchSequence,
    linked,
    mode,
    openExpressionEditor,
    openSequenceEditor,
    pauseState,
    playbackStatus,
    playbackVisual,
    prepareStudioProjectImport,
    previewAvatarMove,
    previewExpressionDraft,
    previewExpressionMove,
    previewStateMove,
    projectImportError,
    projectImportRef,
    reduceMotion,
    renameActiveAvatar,
    renderedColors,
    renderedScene,
    saveAvatarEditing,
    saveEditing,
    saveSequenceEditing,
    selectBodyNode,
    selectedBodyNode,
    selectedBodyNodeId,
    selectedExportAnimations,
    selectedSequenceStepId,
    selectedState,
    sequenceEditing,
    sequences,
    setDeleteAvatarOpen,
    setDeleteExpressionOpen,
    setDeleteSequenceOpen,
    setDraggingAvatarId,
    setDraggingExpressionId,
    setDraggingStateId,
    setExportAnimationIds,
    setExportFormat,
    setFocusAvatarName,
    setLinked,
    setLanguage,
    setMode,
    setSelectedSequenceStepId,
    setSequenceEditing,
    setSnapshotBackground,
    setSnapshotColorFrom,
    setSnapshotColorTo,
    setSnapshotFormat,
    setSnapshotSize,
    setSpringSpeed,
    setStatePlayerExpanded,
    showWire,
    snapshotBackground,
    snapshotColorFrom,
    snapshotColorTo,
    snapshotFormat,
    snapshotSize,
    springSpeed,
    springSpeedRef,
    stateDragOrigin,
    stateDragPreview,
    statePlayerExpanded,
    statePlaying,
    stopState,
    surface,
    t,
    toggleExportAnimation,
    toggleStatePlayback,
    transitionToExpression,
    updateAvatarColors,
    updateAvatarEyeDimension,
    updateAvatarEyePosition,
    updateAvatarEyeSize,
    updateAvatarEyes,
    updateDimension,
    updateHighlight,
    updateImmediate,
    updateNodeVector,
    updateSelectedBodyNode,
    updateSize,
    updateSpacing,
    updateSurface,
    updateWireVisibility,
    workspaceBackButtonRef,
  } = controller
  const playbackFooterY = useMotionValue(0)
  const playbackHandleY = useMotionValue(0)
  const playbackHandleCounterY = useTransform(playbackHandleY, value => -value)
  const playbackFooterDragOriginY = useRef(0)
  const playbackDetailsRef = useRef<HTMLDivElement>(null)
  const measuredSequenceIdRef = useRef<string | null>(null)
  const [playbackFooterCollapsedOffset, setPlaybackFooterCollapsedOffset] = useState(0)
  const playbackDetailsOpacity = useTransform(
    playbackFooterY,
    [0, Math.max(playbackFooterCollapsedOffset, 1)],
    [1, 0]
  )

  useLayoutEffect(() => {
    const details = playbackDetailsRef.current
    if (!details || !activeSequence) return

    const measure = () => {
      const nextOffset = details.getBoundingClientRect().height
      if (nextOffset <= 0) return

      const firstMeasurement = measuredSequenceIdRef.current !== activeSequence.id
      if (firstMeasurement) {
        measuredSequenceIdRef.current = activeSequence.id
        playbackFooterY.set(statePlayerExpanded ? 0 : nextOffset)
      } else if (
        playbackFooterCollapsedOffset > 0 &&
        Math.abs(nextOffset - playbackFooterCollapsedOffset) > 0.5
      ) {
        const progress = Math.min(
          1,
          Math.max(0, playbackFooterY.get() / playbackFooterCollapsedOffset)
        )
        playbackFooterY.set(progress * nextOffset)
      }
      setPlaybackFooterCollapsedOffset(nextOffset)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(details)
    return () => observer.disconnect()
  }, [
    activeSequence,
    language,
    playbackFooterCollapsedOffset,
    playbackFooterY,
    statePlayerExpanded,
  ])

  const snapPlaybackFooter = (expanded: boolean) => {
    setStatePlayerExpanded(expanded)
    animate(playbackFooterY, expanded ? 0 : playbackFooterCollapsedOffset, {
      type: 'spring',
      stiffness: 440,
      damping: 40,
      duration: reduceMotion ? 0 : undefined,
    })
  }

  return (
    <Drawer>
      <main
        className={`inspector ${editing ? 'expression-workspace-active' : sequenceEditing ? 'sequence-workspace-active' : bodyEditing ? 'body-workspace' : 'studio-workspace'}${activeSequence && !editorPageOpen ? ' state-player-active' : ''}`}
      >
        <StudioIdentity
          className="inspector-identity"
          language={language}
          setLanguage={setLanguage}
          t={t}
        />
        {sequenceEditing && !editing && (
          <motion.div
            key={`sequence-${sequenceEditing.sourceId ?? 'new'}`}
            className="workspace-page sequence-workspace"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <SequenceWorkspace
              editing={sequenceEditing}
              expressions={expressions}
              surface={surface}
              bodyNodes={bodyNodes}
              colors={activeAvatar.colors}
              avatarEyes={activeAvatarEyes}
              selectedStepId={selectedSequenceStepId}
              backButtonRef={workspaceBackButtonRef}
              reduceMotion={Boolean(reduceMotion)}
              onSelectedStepChange={setSelectedSequenceStepId}
              onChange={draft =>
                setSequenceEditing(current => (current ? { ...current, draft } : current))
              }
              onPreviewStep={step => {
                const expressionIndex = findExpressionIndex(expressions, step.expressionId)
                const preset = expressions[expressionIndex]
                if (preset) transitionToExpression(preset, expressionIndex, step)
              }}
              onEditExpression={openExpressionEditor}
              onPlay={() => launchSequence(sequenceEditing.draft, false, false)}
              onPause={() => pauseState(false)}
              onStop={() => stopState(false)}
              playing={statePlaying}
              active={activeState === sequenceEditing.draft.id}
              onCancel={cancelSequenceEditing}
              onSave={saveSequenceEditing}
              onDuplicate={duplicateSequenceEditing}
              onDelete={() => setDeleteSequenceOpen(true)}
            />
          </motion.div>
        )}
        {editing && (
          <motion.div
            key={`expression-${editing.index ?? 'new'}`}
            className="workspace-page expression-workspace"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <ExpressionWorkspace
              editing={editing}
              avatarColors={activeAvatar.colors}
              backButtonRef={workspaceBackButtonRef}
              onChange={previewExpressionDraft}
              onCancel={cancelExpressionEditing}
              onSave={saveEditing}
              onDuplicate={() => duplicateExpression(editing.index, editing.draft, true)}
              onDelete={() => setDeleteExpressionOpen(true)}
            />
          </motion.div>
        )}
        {!sequenceEditing &&
          !editing &&
          (bodyEditing ? (
            <header className="workspace-header body-workspace-header">
              <Button
                ref={workspaceBackButtonRef}
                variant="ghost"
                size="icon"
                onClick={cancelAvatarEditing}
                aria-label={t('Retour au studio')}
              >
                <ArrowLeft />
              </Button>
              <div className="workspace-heading">
                <p className="eyebrow">{t('Construction du corps')}</p>
                <Input
                  className="avatar-name-input"
                  aria-label={t('Nom de l’avatar')}
                  autoFocus={focusAvatarName}
                  value={activeAvatar.name}
                  onChange={event => renameActiveAvatar(event.currentTarget.value)}
                  onFocus={event => {
                    if (focusAvatarName) event.currentTarget.select()
                  }}
                  onBlur={event => {
                    if (!event.currentTarget.value.trim()) renameActiveAvatar('Unknown')
                    setFocusAvatarName(false)
                  }}
                />
                <p>
                  {t('Choisis la forme principale puis assemble les primitives autour d’elle.')}
                </p>
              </div>
            </header>
          ) : null)}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            className="mode-page-transition"
            key={mode}
            initial={reduceMotion ? false : { opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: -18 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {!editorPageOpen && (
              <header className="mode-page-header">
                <div>
                  <p className="eyebrow">{activeAvatar.name}</p>
                  <h1>
                    {t(
                      mode === 'manual'
                        ? 'Pose'
                        : mode === 'avatars'
                          ? 'Avatars'
                          : mode === 'expressions'
                            ? 'Expressions'
                            : mode === 'states'
                              ? 'Animations'
                              : 'Exporter'
                    )}
                  </h1>
                </div>
                {mode === 'manual' && (
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    aria-label={t('Réinitialiser')}
                    onClick={() => transitionToExpression({ ...defaultExpression })}
                  >
                    <RotateCcw />
                  </Button>
                )}
              </header>
            )}

            {!editing && mode === 'manual' && (
              <div className="panel-stack">
                {bodyEditing && (
                  <>
                    <ControlSection
                      title="Corps"
                      subtitle="Construction, forme et couleur de la tête de l’avatar."
                    >
                      <InspectorCard className="body-panel">
                        <PanelTitle
                          level={3}
                          title="Construction du corps"
                          subtitle="Une forme principale porte les yeux. Les autres primitives se placent autour d’elle."
                        />
                        <div className="body-tree">
                          <Button
                            variant="outline"
                            type="button"
                            aria-pressed={selectedBodyNodeId === 'primary'}
                            onClick={() => selectBodyNode('primary')}
                          >
                            <span className="body-node-icon body-node-icon-primary">
                              <SurfaceThumbnail surface={surface} />
                            </span>
                            <span>
                              <strong>{t('Forme principale')}</strong>
                              <small>
                                {t(surfaceLabels[surface.type])} · {t('porte les yeux')}
                              </small>
                            </span>
                          </Button>
                          {bodyNodes.map(node => (
                            <Button
                              variant="outline"
                              type="button"
                              key={node.id}
                              aria-pressed={selectedBodyNodeId === node.id}
                              onClick={() => selectBodyNode(node.id)}
                            >
                              <span className="body-node-icon">
                                <SurfaceThumbnail surface={node.surface} />
                              </span>
                              <span>
                                <strong>{t(node.name)}</strong>
                                <small>{t(surfaceLabels[node.surface.type])}</small>
                              </span>
                            </Button>
                          ))}
                        </div>
                        <div className="body-add">
                          <span>
                            {t('Ajouter une forme')} · {bodyNodes.length}/{MAX_BODY_NODES}
                          </span>
                          <div>
                            {bodyPrimitiveTypes.map(type => (
                              <Button
                                className="surface-card body-add-card"
                                variant="outline"
                                type="button"
                                key={type}
                                disabled={bodyNodes.length >= MAX_BODY_NODES}
                                onClick={() => addBodyNode(type)}
                              >
                                <SurfaceThumbnail surface={surfacePresets[type]} />
                                <span>{t(surfaceLabels[type])}</span>
                              </Button>
                            ))}
                          </div>
                        </div>
                        {selectedBodyNode && (
                          <div className="body-node-editor">
                            <div className="body-node-actions">
                              <strong>{selectedBodyNode.name}</strong>
                              <div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  type="button"
                                  disabled={bodyNodes.length >= MAX_BODY_NODES}
                                  onClick={duplicateSelectedBodyNode}
                                >
                                  {t('Dupliquer')}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  type="button"
                                  onClick={deleteSelectedBodyNode}
                                >
                                  {t('Supprimer')}
                                </Button>
                              </div>
                            </div>
                            <p className="body-gizmo-help">
                              <Badge variant="outline">{t('Gizmo local')}</Badge>
                              {t(
                                'Glisse un axe pour déplacer la forme, ou un anneau pour la faire tourner.'
                              )}
                            </p>
                            <div className="surface-fields">
                              <NumericField
                                label="Échelle"
                                value={Math.max(
                                  selectedBodyNode.surface.width,
                                  selectedBodyNode.surface.height,
                                  selectedBodyNode.surface.depth
                                )}
                                min={10}
                                max={300}
                                unit="u"
                                onChange={size =>
                                  updateSelectedBodyNode(node => ({
                                    ...node,
                                    surface: scaleSurface(node.surface, size, {
                                      width: 10,
                                      height: 10,
                                      depth: 10,
                                    }),
                                  }))
                                }
                              />
                              {(['width', 'height', 'depth'] as const).map(dimension => (
                                <NumericField
                                  key={dimension}
                                  label={
                                    { width: 'Largeur', height: 'Hauteur', depth: 'Profondeur' }[
                                      dimension
                                    ]
                                  }
                                  value={selectedBodyNode.surface[dimension]}
                                  min={10}
                                  max={300}
                                  unit="u"
                                  onChange={value =>
                                    updateSelectedBodyNode(node => ({
                                      ...node,
                                      surface: { ...node.surface, [dimension]: value },
                                    }))
                                  }
                                />
                              ))}
                              {(selectedBodyNode.surface.type === 'cube' ||
                                selectedBodyNode.surface.type === 'diamond' ||
                                selectedBodyNode.surface.type === 'cylinder') && (
                                <NumericField
                                  label="Rondeur"
                                  value={selectedBodyNode.surface.roundness}
                                  min={0}
                                  max={2}
                                  step={0.01}
                                  onChange={roundness =>
                                    updateSelectedBodyNode(node => ({
                                      ...node,
                                      surface: { ...node.surface, roundness },
                                    }))
                                  }
                                />
                              )}
                              {(selectedBodyNode.surface.type === 'cylinder' ||
                                selectedBodyNode.surface.type === 'cone') && (
                                <NumericField
                                  label="Rondeur globale"
                                  value={selectedBodyNode.surface.morphRoundness ?? 0}
                                  min={0}
                                  max={2}
                                  step={0.01}
                                  onChange={morphRoundness =>
                                    updateSelectedBodyNode(node => ({
                                      ...node,
                                      surface: { ...node.surface, morphRoundness },
                                    }))
                                  }
                                />
                              )}
                              {selectedBodyNode.surface.type === 'cone' && (
                                <>
                                  <NumericField
                                    label="Rondeur pointe"
                                    value={selectedBodyNode.surface.tipRoundness ?? 0}
                                    min={0}
                                    max={2}
                                    step={0.01}
                                    onChange={tipRoundness =>
                                      updateSelectedBodyNode(node => ({
                                        ...node,
                                        surface: { ...node.surface, tipRoundness },
                                      }))
                                    }
                                  />
                                  <NumericField
                                    label="Rondeur base"
                                    value={selectedBodyNode.surface.baseRoundness ?? 0}
                                    min={0}
                                    max={2}
                                    step={0.01}
                                    onChange={baseRoundness =>
                                      updateSelectedBodyNode(node => ({
                                        ...node,
                                        surface: { ...node.surface, baseRoundness },
                                      }))
                                    }
                                  />
                                </>
                              )}
                            </div>
                            <div className="body-transform-grid">
                              <div>
                                <h3>{t('Position locale')}</h3>
                                {(['X', 'Y', 'Z'] as const).map((axis, index) => (
                                  <NumericField
                                    key={axis}
                                    label={axis}
                                    value={selectedBodyNode.position[index]}
                                    unit="u"
                                    onChange={value =>
                                      updateNodeVector('position', index as 0 | 1 | 2, value)
                                    }
                                  />
                                ))}
                              </div>
                              <div>
                                <h3>{t('Rotation locale')}</h3>
                                {(['X', 'Y', 'Z'] as const).map((axis, index) => (
                                  <NumericField
                                    key={axis}
                                    label={axis}
                                    value={selectedBodyNode.rotation[index]}
                                    unit="°"
                                    onChange={value =>
                                      updateNodeVector('rotation', index as 0 | 1 | 2, value)
                                    }
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </InspectorCard>
                      <InspectorCard className="surface-panel">
                        <PanelTitle
                          level={3}
                          title="Forme principale"
                          subtitle="Cette surface est la référence du visage et porte les yeux."
                        />
                        <div className="surface-grid">
                          {bodyPrimitiveTypes.map(type => {
                            const previewSurface =
                              type === surface.type ? surface : surfacePresets[type]
                            return (
                              <Button
                                className="surface-card"
                                variant="outline"
                                type="button"
                                key={type}
                                aria-pressed={surface.type === type}
                                onClick={() => {
                                  selectBodyNode('primary')
                                  if (type !== surface.type) {
                                    updateSurface({ ...surfacePresets[type] })
                                  }
                                }}
                              >
                                <SurfaceThumbnail surface={previewSurface} />
                                <span>{t(surfaceLabels[type])}</span>
                              </Button>
                            )
                          })}
                        </div>
                        <div className="surface-fields">
                          <NumericField
                            label="Échelle"
                            value={Math.max(surface.width, surface.height, surface.depth)}
                            min={120}
                            max={300}
                            unit="u"
                            onChange={size =>
                              updateSurface(
                                scaleSurface(surface, size, { width: 120, height: 120, depth: 100 })
                              )
                            }
                          />
                          <NumericField
                            label="Largeur"
                            value={surface.width}
                            min={120}
                            max={300}
                            unit="u"
                            onChange={width => updateSurface({ ...surface, width })}
                          />
                          <NumericField
                            label="Hauteur"
                            value={surface.height}
                            min={120}
                            max={300}
                            unit="u"
                            onChange={height => updateSurface({ ...surface, height })}
                          />
                          <NumericField
                            label="Profondeur"
                            value={surface.depth}
                            min={100}
                            max={300}
                            unit="u"
                            onChange={depth => updateSurface({ ...surface, depth })}
                          />
                          {(surface.type === 'cube' || surface.type === 'diamond') && (
                            <NumericField
                              label="Rondeur"
                              value={surface.roundness}
                              min={0}
                              max={2}
                              step={0.01}
                              onActiveChange={active => updateHighlight(active ? 'head' : null)}
                              onChange={roundness => updateSurface({ ...surface, roundness })}
                            />
                          )}
                          {surface.type === 'cylinder' && (
                            <NumericField
                              label="Rondeur des arêtes"
                              value={surface.roundness}
                              min={0}
                              max={2}
                              step={0.01}
                              onActiveChange={active => updateHighlight(active ? 'head' : null)}
                              onChange={roundness => updateSurface({ ...surface, roundness })}
                            />
                          )}
                          {(surface.type === 'cylinder' || surface.type === 'cone') && (
                            <NumericField
                              label="Rondeur globale"
                              value={surface.morphRoundness ?? 0}
                              min={0}
                              max={2}
                              step={0.01}
                              onActiveChange={active => updateHighlight(active ? 'head' : null)}
                              onChange={morphRoundness =>
                                updateSurface({ ...surface, morphRoundness })
                              }
                            />
                          )}
                          {surface.type === 'cone' && (
                            <>
                              <NumericField
                                label="Rondeur pointe"
                                value={surface.tipRoundness ?? 0}
                                min={0}
                                max={2}
                                step={0.01}
                                onActiveChange={active => updateHighlight(active ? 'head' : null)}
                                onChange={tipRoundness =>
                                  updateSurface({ ...surface, tipRoundness })
                                }
                              />
                              <NumericField
                                label="Rondeur base"
                                value={surface.baseRoundness ?? 0}
                                min={0}
                                max={2}
                                step={0.01}
                                onActiveChange={active => updateHighlight(active ? 'head' : null)}
                                onChange={baseRoundness =>
                                  updateSurface({ ...surface, baseRoundness })
                                }
                              />
                            </>
                          )}
                        </div>
                      </InspectorCard>
                      <InspectorCard className="color-panel">
                        <PanelTitle
                          level={3}
                          title="Couleur du corps"
                          subtitle="Couleur de base utilisée par les poses et les expressions."
                        />
                        <ColorField
                          label="Corps"
                          value={activeAvatar.colors.body}
                          onChange={body => updateAvatarColors({ body })}
                        />
                      </InspectorCard>
                    </ControlSection>
                    <ControlSection
                      title="Yeux"
                      subtitle="Forme, placement, orientation et couleur du regard par défaut."
                    >
                      <p className="section-description">
                        {t(
                          'Définis l’identité du regard de cet avatar. Les poses s’ajoutent ensuite à cette base.'
                        )}
                      </p>
                      {(['width', 'height', 'size'] as const).map(dimension => (
                        <InspectorCard className="compact" key={`avatar-${dimension}`}>
                          <div className="panel-inline-title">
                            <h3>
                              {t(
                                {
                                  width: 'Largeur',
                                  height: 'Hauteur',
                                  size: 'Taille proportionnelle',
                                }[dimension]
                              )}
                            </h3>
                            <LinkButton
                              linked={linked[dimension]}
                              label={`Lier ${dimension}`}
                              onClick={() =>
                                setLinked(current => ({
                                  ...current,
                                  [dimension]: !current[dimension],
                                }))
                              }
                            />
                          </div>
                          <div className="eye-columns">
                            {(['Left', 'Right'] as Side[]).map(side => {
                              const width = activeAvatarEyes[`width${side}`]
                              const height = activeAvatarEyes[`height${side}`]
                              const value =
                                dimension === 'width'
                                  ? width
                                  : dimension === 'height'
                                    ? height
                                    : Math.max(width, height)
                              return (
                                <NumericField
                                  key={side}
                                  label={side === 'Left' ? 'Œil gauche' : 'Œil droit'}
                                  value={value}
                                  min={10}
                                  max={dimension === 'size' ? 110 : 100}
                                  unit="u"
                                  onActiveChange={active =>
                                    updateHighlight(
                                      active
                                        ? linked[dimension]
                                          ? 'both'
                                          : side === 'Left'
                                            ? 'left'
                                            : 'right'
                                        : null
                                    )
                                  }
                                  onChange={next =>
                                    dimension === 'size'
                                      ? updateAvatarEyeSize(side, next)
                                      : updateAvatarEyeDimension(side, dimension, next)
                                  }
                                />
                              )
                            })}
                          </div>
                        </InspectorCard>
                      ))}
                      <InspectorCard>
                        <div className="panel-inline-title">
                          <div>
                            <h3>{t('Position et espacement')}</h3>
                            <p className="panel-inline-subtitle">
                              {t('Coordonnées propres à l’avatar, indépendantes des poses.')}
                            </p>
                          </div>
                          <LinkButton
                            linked={linked.position}
                            label="Lier la position des yeux"
                            onClick={() =>
                              setLinked(current => ({ ...current, position: !current.position }))
                            }
                          />
                        </div>
                        <div className="eye-columns">
                          {(['Left', 'Right'] as Side[]).map(side => (
                            <div className="eye-column" key={side}>
                              <h3>{t(side === 'Left' ? 'Œil gauche' : 'Œil droit')}</h3>
                              <NumericField
                                label="Horizontale"
                                value={activeAvatarEyes[`positionX${side}`]}
                                unit="u"
                                onActiveChange={active =>
                                  updateHighlight(
                                    active
                                      ? linked.position
                                        ? 'both'
                                        : side === 'Left'
                                          ? 'left'
                                          : 'right'
                                      : null
                                  )
                                }
                                onChange={value => updateAvatarEyePosition(side, 'X', value)}
                              />
                              <NumericField
                                label="Verticale"
                                value={activeAvatarEyes[`positionY${side}`]}
                                unit="u"
                                onActiveChange={active =>
                                  updateHighlight(
                                    active
                                      ? linked.position
                                        ? 'both'
                                        : side === 'Left'
                                          ? 'left'
                                          : 'right'
                                      : null
                                  )
                                }
                                onChange={value => updateAvatarEyePosition(side, 'Y', value)}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="position-spacing">
                          <NumericField
                            label="Espacement"
                            value={activeAvatarEyes.spacing}
                            min={0}
                            max={150}
                            unit="u"
                            onActiveChange={active => updateHighlight(active ? 'both' : null)}
                            onChange={spacing => updateAvatarEyes({ spacing })}
                          />
                        </div>
                      </InspectorCard>
                      <InspectorCard>
                        <div className="panel-inline-title">
                          <PanelTitle
                            level={3}
                            title="Rotation locale"
                            subtitle="Inclinaison par défaut propre à chaque œil."
                          />
                          <LinkButton
                            linked={linked.rotation}
                            label="Lier les rotations"
                            onClick={() =>
                              setLinked(current => ({ ...current, rotation: !current.rotation }))
                            }
                          />
                        </div>
                        <div className="eye-columns">
                          <NumericField
                            label="Œil gauche"
                            value={activeAvatarEyes.leftAngle}
                            unit="°"
                            onActiveChange={active =>
                              updateHighlight(active ? (linked.rotation ? 'both' : 'left') : null)
                            }
                            onChange={leftAngle =>
                              updateAvatarEyes({
                                leftAngle,
                                ...(linked.rotation ? { rightAngle: -leftAngle } : {}),
                              })
                            }
                          />
                          <NumericField
                            label="Œil droit"
                            value={activeAvatarEyes.rightAngle}
                            unit="°"
                            onActiveChange={active =>
                              updateHighlight(active ? (linked.rotation ? 'both' : 'right') : null)
                            }
                            onChange={rightAngle =>
                              updateAvatarEyes({
                                rightAngle,
                                ...(linked.rotation ? { leftAngle: -rightAngle } : {}),
                              })
                            }
                          />
                        </div>
                      </InspectorCard>
                      <InspectorCard className="color-panel">
                        <PanelTitle
                          level={3}
                          title="Couleur des yeux"
                          subtitle="Couleur de base utilisée par les poses et les expressions."
                        />
                        <ColorField
                          label="Yeux"
                          value={activeAvatar.colors.eyes}
                          onChange={eyes => updateAvatarColors({ eyes })}
                        />
                      </InspectorCard>
                    </ControlSection>
                  </>
                )}
                {!bodyEditing && (
                  <>
                    <ControlSection
                      title="Corps"
                      subtitle="Orientation et apparence générale de la pose."
                    >
                      <InspectorCard className="color-panel">
                        <PanelTitle
                          level={3}
                          title="Couleur du corps"
                          subtitle="La pose peut remplacer temporairement la couleur de l’avatar."
                        />
                        <ColorField
                          label="Corps"
                          value={expression.bodyColor ?? activeAvatar.colors.body}
                          onChange={bodyColor => updateImmediate({ ...expression, bodyColor })}
                        />
                        {expression.bodyColor && (
                          <Button
                            className="inherit-colors"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('Reprendre la couleur de l’avatar')}
                            onClick={() => {
                              const next = { ...expression }
                              delete next.bodyColor
                              updateImmediate(next)
                            }}
                          >
                            <RotateCcw />
                          </Button>
                        )}
                      </InspectorCard>
                      <InspectorCard>
                        <PanelTitle
                          level={3}
                          title="Rotation de la tête"
                          subtitle="Les libellés ↔ sont scrubbables, comme dans Figma."
                        />
                        <NumericField
                          label="Rotation X"
                          value={expression.headX}
                          unit="°"
                          onActiveChange={active => updateHighlight(active ? 'head' : null)}
                          onChange={value => updateImmediate({ ...expression, headX: value })}
                        />
                        <NumericField
                          label="Rotation Y"
                          value={expression.headY}
                          unit="°"
                          onActiveChange={active => updateHighlight(active ? 'head' : null)}
                          onChange={value => updateImmediate({ ...expression, headY: value })}
                        />
                        <NumericField
                          label="Rotation Z"
                          value={expression.headZ}
                          unit="°"
                          onActiveChange={active => updateHighlight(active ? 'head' : null)}
                          onChange={value => updateImmediate({ ...expression, headZ: value })}
                        />
                      </InspectorCard>
                    </ControlSection>
                    <ControlSection
                      title="Yeux"
                      subtitle="Forme, placement, orientation et couleur du regard."
                    >
                      <InspectorCard className="color-panel">
                        <PanelTitle
                          level={3}
                          title="Couleur des yeux"
                          subtitle="La pose peut remplacer temporairement la couleur de l’avatar."
                        />
                        <ColorField
                          label="Yeux"
                          value={expression.eyeColor ?? activeAvatar.colors.eyes}
                          onChange={eyeColor => updateImmediate({ ...expression, eyeColor })}
                        />
                        {expression.eyeColor && (
                          <Button
                            className="inherit-colors"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('Reprendre la couleur de l’avatar')}
                            onClick={() => {
                              const next = { ...expression }
                              delete next.eyeColor
                              updateImmediate(next)
                            }}
                          >
                            <RotateCcw />
                          </Button>
                        )}
                      </InspectorCard>
                      {(['width', 'height', 'size'] as const).map(dimension => (
                        <InspectorCard className="compact" key={dimension}>
                          <div className="panel-inline-title">
                            <h3>
                              {t(
                                {
                                  width: 'Largeur',
                                  height: 'Hauteur',
                                  size: 'Taille proportionnelle',
                                }[dimension]
                              )}
                            </h3>
                            <LinkButton
                              linked={linked[dimension]}
                              label={`Lier ${dimension}`}
                              onClick={() =>
                                setLinked(current => ({
                                  ...current,
                                  [dimension]: !current[dimension],
                                }))
                              }
                            />
                          </div>
                          <div className="eye-columns">
                            {(['Left', 'Right'] as Side[]).map(side => {
                              const width = expression[`width${side}`]
                              const height = expression[`height${side}`]
                              const value =
                                dimension === 'width'
                                  ? width
                                  : dimension === 'height'
                                    ? height
                                    : Math.max(width, height)
                              return (
                                <NumericField
                                  key={side}
                                  label={side === 'Left' ? 'Œil gauche' : 'Œil droit'}
                                  value={value}
                                  min={10}
                                  max={dimension === 'size' ? 110 : 100}
                                  unit="u"
                                  onActiveChange={active =>
                                    updateHighlight(
                                      active
                                        ? linked[dimension]
                                          ? 'both'
                                          : side === 'Left'
                                            ? 'left'
                                            : 'right'
                                        : null
                                    )
                                  }
                                  onChange={next =>
                                    dimension === 'size'
                                      ? updateSize(side, next)
                                      : updateDimension(side, dimension, next)
                                  }
                                />
                              )
                            })}
                          </div>
                        </InspectorCard>
                      ))}
                      <InspectorCard>
                        <PanelTitle
                          level={3}
                          title="Position et espacement"
                          subtitle="Coordonnées communes projetées sur la forme choisie."
                        />
                        <div className="eye-columns">
                          <div className="eye-column">
                            <h3>{t('Œil gauche')}</h3>
                            <NumericField
                              label="Horizontale"
                              value={expression.positionXLeft}
                              unit="u"
                              onActiveChange={active => updateHighlight(active ? 'left' : null)}
                              onChange={value =>
                                updateImmediate({ ...expression, positionXLeft: value })
                              }
                            />
                            <NumericField
                              label="Verticale"
                              value={expression.positionYLeft}
                              unit="u"
                              onActiveChange={active => updateHighlight(active ? 'left' : null)}
                              onChange={value =>
                                updateImmediate({ ...expression, positionYLeft: value })
                              }
                            />
                          </div>
                          <div className="eye-column">
                            <h3>{t('Œil droit')}</h3>
                            <NumericField
                              label="Horizontale"
                              value={expression.positionXRight}
                              unit="u"
                              onActiveChange={active => updateHighlight(active ? 'right' : null)}
                              onChange={value =>
                                updateImmediate({ ...expression, positionXRight: value })
                              }
                            />
                            <NumericField
                              label="Verticale"
                              value={expression.positionYRight}
                              unit="u"
                              onActiveChange={active => updateHighlight(active ? 'right' : null)}
                              onChange={value =>
                                updateImmediate({ ...expression, positionYRight: value })
                              }
                            />
                          </div>
                        </div>
                        <div className="position-spacing">
                          <NumericField
                            label="Espacement"
                            value={expression.spacing}
                            min={0}
                            max={150}
                            unit="u"
                            onActiveChange={active => updateHighlight(active ? 'both' : null)}
                            onChange={updateSpacing}
                          />
                        </div>
                      </InspectorCard>
                      <InspectorCard>
                        <div className="panel-inline-title">
                          <PanelTitle
                            level={3}
                            title="Rotation locale"
                            subtitle="Inclinaison propre à chaque œil."
                          />
                          <LinkButton
                            linked={linked.rotation}
                            label="Lier les rotations"
                            onClick={() =>
                              setLinked(current => ({ ...current, rotation: !current.rotation }))
                            }
                          />
                        </div>
                        <div className="eye-columns">
                          <NumericField
                            label="Œil gauche"
                            value={expression.leftAngle}
                            unit="°"
                            onActiveChange={active =>
                              updateHighlight(active ? (linked.rotation ? 'both' : 'left') : null)
                            }
                            onChange={value =>
                              updateImmediate({
                                ...expression,
                                leftAngle: value,
                                ...(linked.rotation ? { rightAngle: -value } : {}),
                              })
                            }
                          />
                          <NumericField
                            label="Œil droit"
                            value={expression.rightAngle}
                            unit="°"
                            onActiveChange={active =>
                              updateHighlight(active ? (linked.rotation ? 'both' : 'right') : null)
                            }
                            onChange={value =>
                              updateImmediate({
                                ...expression,
                                rightAngle: value,
                                ...(linked.rotation ? { leftAngle: -value } : {}),
                              })
                            }
                          />
                        </div>
                      </InspectorCard>
                    </ControlSection>
                    <ControlSection
                      title="Projection"
                      subtitle="Perspective et repères appliqués à la surface active."
                    >
                      <InspectorCard>
                        <PanelTitle
                          level={3}
                          title="Perspective"
                          subtitle="Profondeur simulée du visage."
                        />
                        <NumericField
                          label="Perspective"
                          value={expression.perspective}
                          step={0.01}
                          unit="×"
                          onChange={value => updateImmediate({ ...expression, perspective: value })}
                        />
                        <div className="switch">
                          <span>{t('Afficher le maillage')}</span>
                          <Switch
                            checked={showWire}
                            onCheckedChange={updateWireVisibility}
                            aria-label={t('Afficher le maillage')}
                          />
                        </div>
                      </InspectorCard>
                    </ControlSection>
                  </>
                )}
              </div>
            )}
            {!editorPageOpen && mode === 'avatars' && <AvatarPage controller={controller} />}

            {!sequenceEditing && !editing && bodyEditing && (
              <footer className="workspace-footer">
                <div className="workspace-footer-secondary">
                  <Button
                    variant="destructive"
                    disabled={avatars.length <= 1}
                    onClick={() => setDeleteAvatarOpen(true)}
                  >
                    <Trash2 />
                    {t('Supprimer')}
                  </Button>
                  <Button variant="outline" onClick={() => duplicateAvatar(activeAvatar, true)}>
                    <Copy />
                    {t('Dupliquer')}
                  </Button>
                </div>
                <Button onClick={saveAvatarEditing}>{t('Enregistrer')}</Button>
              </footer>
            )}

            {!sequenceEditing && !editing && !bodyEditing && mode === 'expressions' && (
              <div className="panel-stack">
                <InspectorCard>
                  <div className="preset-header">
                    <div>
                      <p className="eyebrow">{expressions.length} presets</p>
                    </div>
                    <span>{t('Double-clic pour modifier')}</span>
                  </div>
                  <div className="expression-grid">
                    {expressions.map((preset, index) => (
                      <motion.div
                        className="expression-sort-item"
                        data-dragging={draggingExpressionId === preset.id || undefined}
                        key={preset.id}
                        layout="position"
                        layoutId={`expression-${preset.id}`}
                        animate={{
                          opacity: draggingExpressionId === preset.id ? 0.28 : 1,
                          scale: draggingExpressionId === preset.id ? 0.96 : 1,
                        }}
                        transition={
                          reduceMotion
                            ? { duration: 0 }
                            : { type: 'spring', stiffness: 520, damping: 42, mass: 0.7 }
                        }
                      >
                        <ExpressionCard
                          expression={preset}
                          index={index}
                          active={activeExpression === index}
                          surface={surface}
                          bodyNodes={bodyNodes}
                          colors={activeAvatar.colors}
                          avatarEyes={activeAvatarEyes}
                          previewId={String(index)}
                          onSelect={() => transitionToExpression(preset, index)}
                          onEdit={() => openExpressionEditor(index, preset)}
                          onDuplicate={() => duplicateExpression(index, preset)}
                          onDelete={() => {
                            openExpressionEditor(index, preset)
                            setDeleteExpressionOpen(true)
                          }}
                          draggable
                          onDragStart={event => {
                            expressionDragOrigin.current = expressions
                            expressionDragPreview.current = expressions
                            draggedExpressionId.current = preset.id
                            setDraggingExpressionId(preset.id)
                            event.dataTransfer.effectAllowed = 'move'
                          }}
                          onDragEnter={() => previewExpressionMove(preset.id)}
                          onDragOver={event => {
                            event.preventDefault()
                            event.dataTransfer.dropEffect = 'move'
                          }}
                          onDrop={event => {
                            event.preventDefault()
                            commitExpressionMove(preset.id)
                          }}
                          onDragEnd={cancelExpressionMove}
                        />
                      </motion.div>
                    ))}
                    <Button
                      className="expression-add creation-card"
                      variant="outline"
                      type="button"
                      onDragOver={event => event.preventDefault()}
                      onDrop={event => {
                        event.preventDefault()
                        commitExpressionMove(null)
                      }}
                      onClick={() => openExpressionEditor(null, expression)}
                      aria-label={t('Nouvelle expression')}
                    >
                      <Plus />
                    </Button>
                  </div>
                </InspectorCard>
                <InspectorCard>
                  <PanelTitle
                    title="Mouvement"
                    subtitle="Motion interpole les valeurs et notre moteur effectue le slerp quaternion."
                  />
                  <NumericField
                    label="Vitesse du ressort"
                    value={springSpeed}
                    step={0.5}
                    onChange={value => {
                      springSpeedRef.current = value
                      setSpringSpeed(value)
                    }}
                  />
                  <div className="button-row">
                    <Button variant="outline" type="button" onClick={() => blink()}>
                      {t('Cligner')}
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => {
                        const index = Math.floor(Math.random() * expressions.length)
                        transitionToExpression(expressions[index], index)
                      }}
                    >
                      {t('Expression aléatoire')}
                    </Button>
                  </div>
                </InspectorCard>
              </div>
            )}

            {!sequenceEditing && !editing && !bodyEditing && mode === 'states' && (
              <div className="panel-stack">
                <InspectorCard>
                  <div className="preset-header">
                    <div>
                      <p className="eyebrow">
                        {sequences.length} {t('animations')}
                      </p>
                    </div>
                  </div>
                  <div className="state-groups">
                    {groupSequences(sequences).map(group => (
                      <div
                        key={group.name}
                        onDragOver={event => event.preventDefault()}
                        onDrop={event => {
                          event.preventDefault()
                          commitStateMove(null, group.name)
                        }}
                      >
                        <strong>
                          {group.sequences.every(sequence => sequence.builtIn)
                            ? t(group.name)
                            : group.name}
                        </strong>
                        <div className="state-buttons">
                          {group.sequences.map(sequence => {
                            const firstStep = sequence.steps[0]
                            const firstExpression = firstStep
                              ? expressionById.get(firstStep.expressionId)
                              : undefined
                            const card = (
                              <Button
                                className="expression-card state-card"
                                variant="outline"
                                type="button"
                                draggable
                                aria-pressed={selectedState === sequence.id}
                                onDragStart={event => {
                                  stateDragOrigin.current = sequences
                                  stateDragPreview.current = sequences
                                  draggedStateId.current = sequence.id
                                  setDraggingStateId(sequence.id)
                                  event.dataTransfer.effectAllowed = 'move'
                                }}
                                onDragEnter={() => previewStateMove(sequence.id, group.name)}
                                onDragOver={event => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  event.dataTransfer.dropEffect = 'move'
                                }}
                                onDrop={event => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  commitStateMove(sequence.id, group.name)
                                }}
                                onDragEnd={cancelStateMove}
                                onClick={() => launchSequence(sequence)}
                                onDoubleClick={() => openSequenceEditor(sequence)}
                              >
                                <ExpressionPreview
                                  expression={
                                    firstExpression ?? expressions[0] ?? defaultExpression
                                  }
                                  surface={surface}
                                  bodyNodes={bodyNodes}
                                  colors={activeAvatar.colors}
                                  avatarEyes={activeAvatarEyes}
                                  id={`state-card-${sequence.id}`}
                                />
                                <span>{sequence.builtIn ? t(sequence.name) : sequence.name}</span>
                              </Button>
                            )
                            return (
                              <motion.div
                                className="state-sort-item"
                                data-dragging={draggingStateId === sequence.id || undefined}
                                key={sequence.id}
                                layout="position"
                                layoutId={`state-${sequence.id}`}
                                animate={{
                                  opacity: draggingStateId === sequence.id ? 0.28 : 1,
                                  scale: draggingStateId === sequence.id ? 0.96 : 1,
                                }}
                                transition={
                                  reduceMotion
                                    ? { duration: 0 }
                                    : { type: 'spring', stiffness: 520, damping: 42, mass: 0.7 }
                                }
                              >
                                <ContextMenu>
                                  <ContextMenuTrigger render={card} />
                                  <ContextMenuContent>
                                    <ContextMenuItem onClick={() => openSequenceEditor(sequence)}>
                                      <Pencil />
                                      {t('Modifier')}
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => duplicateState(sequence)}>
                                      <Copy />
                                      {t('Dupliquer')}
                                    </ContextMenuItem>
                                    <ContextMenuSeparator />
                                    <ContextMenuItem
                                      variant="destructive"
                                      onClick={() => {
                                        openSequenceEditor(sequence)
                                        setDeleteSequenceOpen(true)
                                      }}
                                    >
                                      <Trash2 />
                                      {t('Supprimer')}
                                    </ContextMenuItem>
                                  </ContextMenuContent>
                                </ContextMenu>
                              </motion.div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="state-buttons">
                      <Button
                        className="expression-add creation-card"
                        variant="outline"
                        type="button"
                        onClick={() => openSequenceEditor()}
                        aria-label={t('Nouvelle animation')}
                      >
                        <Plus />
                      </Button>
                    </div>
                  </div>
                </InspectorCard>
              </div>
            )}

            {!sequenceEditing && !editing && !bodyEditing && mode === 'export' && (
              <Accordion className="export-panel" defaultValue={['snapshot']}>
                <ExportSection
                  value="avatar"
                  title="Exporter l’avatar"
                  subtitle="Télécharge un composant autonome avec les animations de ton choix."
                >
                  <InspectorCard>
                    <div className="export-avatar-summary">
                      <ExpressionPreview
                        expression={expressions[0] ?? defaultExpression}
                        surface={activeAvatar.body.primary}
                        bodyNodes={activeAvatar.body.nodes}
                        colors={activeAvatar.colors}
                        avatarEyes={activeAvatarEyes}
                        id={`export-avatar-${activeAvatar.id}`}
                      />
                      <div>
                        <small>{t('Avatar sélectionné')}</small>
                        <strong>{activeAvatar.name}</strong>
                      </div>
                    </div>
                  </InspectorCard>

                  <InspectorCard>
                    <PanelTitle
                      title="Format"
                      subtitle="Choisis l’intégration correspondant à ton projet."
                    />
                    <div className="export-format-grid">
                      <Button
                        variant="outline"
                        type="button"
                        aria-pressed={exportFormat === 'react'}
                        onClick={() => setExportFormat('react')}
                      >
                        <FileCode2 />
                        <span>
                          <strong>React / TypeScript</strong>
                          <small>{t('Package React local (.zip)')}</small>
                        </span>
                      </Button>
                      <Button
                        variant="outline"
                        type="button"
                        aria-pressed={exportFormat === 'javascript'}
                        onClick={() => setExportFormat('javascript')}
                      >
                        <FileCode2 />
                        <span>
                          <strong>{t('Module JavaScript')}</strong>
                          <small>{t('Projet HTML + module JS (.zip)')}</small>
                        </span>
                      </Button>
                    </div>
                  </InspectorCard>

                  <InspectorCard>
                    <div className="preset-header export-animation-header">
                      <div>
                        <p className="eyebrow">
                          {selectedExportAnimations.length}/{sequences.length} {t('sélectionnées')}
                        </p>
                        <h2>{t('Animations à exporter')}</h2>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() =>
                          setExportAnimationIds(
                            selectedExportAnimations.length === sequences.length
                              ? []
                              : sequences.map(animation => animation.id)
                          )
                        }
                      >
                        {t(
                          selectedExportAnimations.length === sequences.length
                            ? 'Tout désélectionner'
                            : 'Tout sélectionner'
                        )}
                      </Button>
                    </div>
                    <div className="state-buttons export-animation-grid">
                      {sequences.map(animation => {
                        const firstStep = animation.steps[0]
                        const firstExpression = firstStep
                          ? expressionById.get(firstStep.expressionId)
                          : undefined
                        return (
                          <Button
                            className="expression-card state-card"
                            variant="outline"
                            type="button"
                            key={animation.id}
                            aria-pressed={exportAnimationIdSet.has(animation.id)}
                            onClick={() => toggleExportAnimation(animation.id)}
                          >
                            <ExpressionPreview
                              expression={firstExpression ?? expressions[0] ?? defaultExpression}
                              surface={surface}
                              bodyNodes={bodyNodes}
                              colors={activeAvatar.colors}
                              avatarEyes={activeAvatarEyes}
                              id={`export-animation-${animation.id}`}
                            />
                            <span>{animation.builtIn ? t(animation.name) : animation.name}</span>
                          </Button>
                        )
                      })}
                    </div>
                  </InspectorCard>

                  <Button
                    className="export-download"
                    type="button"
                    disabled={!selectedExportAnimations.length}
                    onClick={downloadAvatarExport}
                  >
                    <Download />
                    {t(
                      exportFormat === 'react'
                        ? 'Télécharger le package React'
                        : 'Télécharger le module'
                    )}
                  </Button>
                </ExportSection>

                <ExportSection
                  value="snapshot"
                  title="Mode photo"
                  subtitle="Capture une image statique de l’avatar."
                >
                  <InspectorCard className="snapshot-preview-card">
                    <SnapshotPreview
                      scene={renderedScene}
                      colors={renderedColors}
                      background={snapshotBackground}
                      colorFrom={snapshotColorFrom}
                      colorTo={snapshotColorTo}
                    />
                    <div>
                      <small>{t('Aperçu du mode photo')}</small>
                      <strong>{activeAvatar.name}</strong>
                      <span>
                        {snapshotSize} × {snapshotSize} px · {snapshotFormat.toUpperCase()}
                      </span>
                    </div>
                  </InspectorCard>

                  <InspectorCard>
                    <PanelTitle
                      title="Arrière-plan"
                      subtitle="Choisis un fond transparent, uni ou en dégradé."
                    />
                    <Field className="snapshot-background-field" orientation="horizontal">
                      <FieldTitle>{t('Style')}</FieldTitle>
                      <Select
                        value={snapshotBackground}
                        items={[
                          { value: 'transparent', label: t('Transparent') },
                          { value: 'solid', label: t('Uni') },
                          { value: 'linear', label: t('Dégradé linéaire') },
                          { value: 'radial', label: t('Dégradé radial') },
                        ]}
                        onValueChange={next =>
                          next && setSnapshotBackground(next as SnapshotBackground)
                        }
                      >
                        <SelectTrigger aria-label={t('Style d’arrière-plan')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="transparent">{t('Transparent')}</SelectItem>
                          <SelectItem value="solid">{t('Uni')}</SelectItem>
                          <SelectItem value="linear">{t('Dégradé linéaire')}</SelectItem>
                          <SelectItem value="radial">{t('Dégradé radial')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {snapshotBackground !== 'transparent' && (
                      <div className="snapshot-colors">
                        <ColorField
                          label={snapshotBackground === 'solid' ? 'Couleur' : 'Départ'}
                          value={snapshotColorFrom}
                          onChange={setSnapshotColorFrom}
                        />
                        {(snapshotBackground === 'linear' || snapshotBackground === 'radial') && (
                          <ColorField
                            label="Arrivée"
                            value={snapshotColorTo}
                            onChange={setSnapshotColorTo}
                          />
                        )}
                      </div>
                    )}
                  </InspectorCard>

                  <InspectorCard>
                    <Field className="snapshot-background-field" orientation="horizontal">
                      <div>
                        <FieldTitle>{t('Format d’export')}</FieldTitle>
                        <small>{t('Choisis le type de fichier généré par le mode photo.')}</small>
                      </div>
                      <Select
                        value={snapshotFormat}
                        items={[
                          { value: 'png', label: 'PNG' },
                          { value: 'svg', label: 'SVG' },
                        ]}
                        onValueChange={next => next && setSnapshotFormat(next as SnapshotFormat)}
                      >
                        <SelectTrigger aria-label={t('Format d’export du mode photo')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="png">PNG</SelectItem>
                          <SelectItem value="svg">SVG</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Separator className="snapshot-settings-separator" />
                    <Field className="snapshot-background-field" orientation="horizontal">
                      <div>
                        <FieldTitle>{t('Définition')}</FieldTitle>
                        <small>{t('Dimensions du fichier exporté.')}</small>
                      </div>
                      <Select
                        value={snapshotSize}
                        items={['512', '1024', '2048'].map(value => ({
                          value,
                          label: `${value} px`,
                        }))}
                        onValueChange={next => next && setSnapshotSize(next)}
                      >
                        <SelectTrigger aria-label={t('Définition du mode photo')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="512">512 px</SelectItem>
                          <SelectItem value="1024">1024 px</SelectItem>
                          <SelectItem value="2048">2048 px</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </InspectorCard>
                </ExportSection>

                <ExportSection
                  value="project"
                  title="Projet du Studio"
                  subtitle="Transfère tous les avatars, expressions et animations vers un autre navigateur."
                >
                  <div className="project-transfer-actions">
                    <Button variant="outline" type="button" onClick={downloadStudioProject}>
                      <Download />
                      {t('Télécharger le projet JSON')}
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => projectImportRef.current?.click()}
                    >
                      <Upload />
                      {t('Importer un projet JSON')}
                    </Button>
                    <input
                      ref={projectImportRef}
                      className="project-import-input"
                      type="file"
                      accept="application/json,.json"
                      aria-label={t('Importer un projet JSON')}
                      onChange={event => {
                        prepareStudioProjectImport(event.currentTarget.files?.[0])
                        event.currentTarget.value = ''
                      }}
                    />
                  </div>
                  {projectImportError && (
                    <p className="project-transfer-error" role="alert">
                      {projectImportError}
                    </p>
                  )}
                </ExportSection>
              </Accordion>
            )}
          </motion.div>
        </AnimatePresence>
        {activeSequence && !editorPageOpen && (
          <motion.footer
            className={`state-playback-footer${statePlayerExpanded ? ' is-expanded' : ''}`}
            style={{ y: playbackFooterY }}
          >
            <div className="state-playback-drag-handle-slot">
              <motion.div style={{ y: playbackHandleCounterY }}>
                <motion.button
                  className="state-playback-drag-handle"
                  style={{ y: playbackHandleY }}
                  type="button"
                  drag="y"
                  dragMomentum={false}
                  aria-expanded={statePlayerExpanded}
                  aria-label={t(
                    statePlayerExpanded
                      ? 'Masquer les détails de l’animation'
                      : 'Afficher les détails de l’animation'
                  )}
                  onTap={() => snapPlaybackFooter(!statePlayerExpanded)}
                  onDragStart={() => {
                    playbackFooterDragOriginY.current = playbackFooterY.get()
                  }}
                  onDrag={(_, info) => {
                    playbackFooterY.set(
                      Math.min(
                        playbackFooterCollapsedOffset,
                        Math.max(0, playbackFooterDragOriginY.current + info.offset.y)
                      )
                    )
                  }}
                  onDragEnd={(_, info) => {
                    playbackHandleY.set(0)
                    const projectedY = playbackFooterY.get() + info.velocity.y * 0.16
                    snapPlaybackFooter(projectedY < playbackFooterCollapsedOffset / 2)
                  }}
                >
                  <span />
                </motion.button>
              </motion.div>
            </div>
            <div className="state-playback-bar">
              <div className="state-playback-timeline">
                {activeSequence.steps.map((step, position) => {
                  const expressionIndex = findExpressionIndex(expressions, step.expressionId)
                  const preset = expressions[expressionIndex]
                  if (!preset) return null
                  return (
                    <Button
                      className="state-playback-step"
                      variant="outline"
                      type="button"
                      key={step.id}
                      aria-pressed={activeExpression === expressionIndex}
                      onClick={() => transitionToExpression(preset, expressionIndex, step)}
                    >
                      <ExpressionPreview
                        expression={preset}
                        surface={surface}
                        bodyNodes={bodyNodes}
                        colors={activeAvatar.colors}
                        avatarEyes={activeAvatarEyes}
                        id={`player-${activeSequence.id}-${position}`}
                      />
                      {playbackVisual.position === position && (
                        <span
                          className="state-playback-progress"
                          key={`${step.id}-${playbackVisual.run}`}
                          aria-hidden="true"
                          style={
                            {
                              animationDuration: `${Math.max(playbackVisual.durationMs, 1)}ms`,
                              animationPlayState: statePlaying ? 'running' : 'paused',
                            } as CSSProperties
                          }
                        />
                      )}
                    </Button>
                  )
                })}
              </div>
              <div className="state-playback-controls">
                <StatePlayer
                  name={activeSequenceLabel}
                  status={playbackStatus}
                  onToggle={toggleStatePlayback}
                  onStop={stopState}
                />
              </div>
            </div>
            <motion.div
              ref={playbackDetailsRef}
              className="state-playback-details-shell"
              style={{ opacity: playbackDetailsOpacity }}
              aria-hidden={!statePlayerExpanded}
            >
              <div className="state-playback-details">
                <div className="state-playback-details-header">
                  <div>
                    <p className="eyebrow">{t('Détails de l’animation')}</p>
                    <h2>{activeSequenceLabel}</h2>
                    <p>
                      {activeSequence.builtIn
                        ? t(activeSequence.description)
                        : activeSequence.description}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {t('Mode de lecture')} · {t(activeSequence.playbackMode)}
                  </Badge>
                </div>
                <div className="state-playback-detail-grid">
                  <div>
                    <span>{t('Expressions')}</span>
                    <strong>{activeSequence.steps.length}</strong>
                    <small>
                      {activeSequence.steps
                        .map(step => formatSeconds(step.holdMs, language))
                        .join(' · ')}
                    </small>
                  </div>
                  <div>
                    <span>{t('Premier clignement')}</span>
                    <strong>
                      {activeSequence.blink.enabled
                        ? formatSeconds(activeSequence.blink.initialDelayMs, language)
                        : t('Désactivé')}
                    </strong>
                    <small>{t('après le lancement')}</small>
                  </div>
                  <div>
                    <span>{t('Intervalle du clignement')}</span>
                    <strong>
                      {formatSeconds(activeSequence.blink.minIntervalMs, language)}–
                      {formatSeconds(activeSequence.blink.maxIntervalMs, language)}
                    </strong>
                    <small>{t('tirage aléatoire')}</small>
                  </div>
                  <div>
                    <span>{t('Durée du clignement')}</span>
                    <strong>{activeSequence.blink.durationMs} ms</strong>
                    <small>{t('fermeture et ouverture')}</small>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.footer>
        )}
        {!editorPageOpen && (
          <nav className="mobile-mode-tabs" aria-label={t('Mode d’édition')}>
            <Button
              className="mobile-mode-tab mobile-avatar-tab"
              variant="ghost"
              type="button"
              aria-pressed={mode === 'avatars'}
              aria-label={t('Choisir un avatar')}
              onClick={() => setMode('avatars')}
            >
              <ExpressionPreview
                expression={expressions[0] ?? defaultExpression}
                surface={activeAvatar.body.primary}
                bodyNodes={activeAvatar.body.nodes}
                colors={activeAvatar.colors}
                avatarEyes={activeAvatarEyes}
                id={`active-avatar-tab-${activeAvatar.id}`}
              />
              <span>{activeAvatar.name}</span>
            </Button>
            {(
              [
                ['manual', t('Pose'), Move3D],
                ['expressions', t('Expressions'), Smile],
                ['states', t('Animations'), Play],
                ['export', t('Exporter'), Download],
              ] as const
            ).map(([value, label, Icon]) => (
              <Button
                className="mobile-mode-tab"
                variant="ghost"
                type="button"
                key={value}
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                <Icon />
                <span>{label}</span>
              </Button>
            ))}
          </nav>
        )}
      </main>
    </Drawer>
  )
}
