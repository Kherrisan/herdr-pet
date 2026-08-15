import { Camera, Info } from 'lucide-react'
import { motion } from 'motion/react'
import { type CSSProperties, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { AvatarCanvas } from '@/features/rendering/components/AvatarCanvas'
import { StudioIdentity } from '@/features/studio/components/StudioIdentity'
import type { StudioController } from '@/features/studio/useStudioController'

export function StudioStage({ controller }: { controller: StudioController }) {
  const [photoHelpOpen, setPhotoHelpOpen] = useState(false)
  const {
    activeAvatarEyes,
    activeSequenceLabel,
    bodyEditing,
    canvasExpression,
    commitBodyNode,
    editing,
    expression,
    freezeLivePreviewForManipulation,
    highlight,
    linked,
    mode,
    persistEditedEyeExpression,
    photoFlash,
    playbackStatus,
    previewCanvasExpression,
    previewExpressionDraft,
    previewSelectedBodyNode,
    renderedColors,
    renderedRotationGizmo,
    renderedScene,
    selectBodyNode,
    selectedBodyNode,
    selectedBodyNodeId,
    selectedEyeSide,
    setEditing,
    setSelectedEyeSide,
    showWire,
    surface,
    t,
    takePicture,
    transitionToExpression,
    updateHighlight,
    updateImmediate,
  } = controller
  return (
    <motion.section
      className="stage-column"
      style={
        {
          '--avatar-body-color': renderedColors.body,
          '--avatar-eye-color': renderedColors.eyes,
        } as CSSProperties
      }
    >
      <StudioIdentity
        className="stage-identity"
        language={controller.language}
        setLanguage={controller.setLanguage}
        t={t}
      />
      <AvatarCanvas
        expression={canvasExpression}
        avatarEyes={activeAvatarEyes}
        surface={surface}
        scene={renderedScene}
        rotationGizmo={renderedRotationGizmo}
        showWire={showWire}
        bodyEditing={bodyEditing}
        selectedBodyNodeId={selectedBodyNodeId}
        selectedBodyNode={selectedBodyNode}
        selectedSide={selectedEyeSide}
        linked={linked}
        highlight={highlight}
        onHighlightChange={updateHighlight}
        onBodyNodeSelect={selectBodyNode}
        onBodyNodePreview={previewSelectedBodyNode}
        onBodyNodeChange={commitBodyNode}
        onEyeSelect={setSelectedEyeSide}
        onPreview={previewCanvasExpression}
        onChange={editing ? previewExpressionDraft : updateImmediate}
        onReset={next => {
          if (editing) {
            setEditing(current => (current ? { ...current, draft: next } : current))
          }
          transitionToExpression(next)
        }}
        onEyeChange={
          editing ? previewExpressionDraft : bodyEditing ? persistEditedEyeExpression : undefined
        }
        playback={
          activeSequenceLabel && playbackStatus !== 'stopped'
            ? { name: activeSequenceLabel, status: playbackStatus }
            : null
        }
        onManipulationStart={freezeLivePreviewForManipulation}
      />
      {photoFlash > 0 && (
        <motion.div
          className="photo-flash"
          key={photoFlash}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.92, 0] }}
          transition={{ duration: 0.38, times: [0, 0.16, 1], ease: 'easeOut' }}
        />
      )}
      <TooltipProvider>
        <div className="photo-capture-bar">
          <Button
            className="photo-capture-button"
            type="button"
            aria-label={t('Prendre une photo')}
            onClick={takePicture}
          >
            <Camera />
            <span className="photo-capture-label">{t('Prendre une photo')}</span>
          </Button>
          <Tooltip
            open={photoHelpOpen}
            onOpenChange={open => {
              if (!open) setPhotoHelpOpen(false)
            }}
          >
            <TooltipTrigger
              closeOnClick={false}
              render={
                <Button
                  className="photo-help-button"
                  variant="secondary"
                  size="icon-sm"
                  type="button"
                  aria-label={t('Informations sur le mode photo')}
                  aria-expanded={photoHelpOpen}
                  onClick={() => setPhotoHelpOpen(open => !open)}
                />
              }
            >
              <Info />
            </TooltipTrigger>
            <TooltipContent side="top" className="photo-help-tooltip">
              {t('Tu peux modifier le format, le fond et la définition du mode photo dans Export.')}
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <p className="stage-credit">
        Made with ❤️ by{' '}
        <a href="https://x.com/_smontlouis" target="_blank" rel="noreferrer">
          @_smontlouis
        </a>
        .
      </p>
    </motion.section>
  )
}
