import { InstructionDialog } from "./InstructionDialog";

export type ComponentTarget = {
  componentId: string;
  file: string;
  /** Phase the viewer was on when they right-clicked. */
  beat: { id: string; label: string };
};

export function ComponentInstructionDialog({
  presentationId,
  target,
  onClose,
}: {
  presentationId: string;
  target: ComponentTarget;
  onClose: () => void;
}) {
  return (
    <InstructionDialog
      presentationId={presentationId}
      title={
        <>
          Instruct Choreo about{" "}
          <code className="font-mono text-sky-700 dark:text-sky-300">{target.componentId}</code>
        </>
      }
      description={
        <>
          <span className="font-mono">{target.file}</span> · right-clicked
          during “{target.beat.label}”. Choreo gets this component’s code and
          choreography.
        </>
      }
      placeholder="Make this a size bigger and have it slide in from the left during this beat."
      history={{ component: target.componentId }}
      buildRequest={(instruction) => ({
        mode: "component",
        id: presentationId,
        component: target.componentId,
        beat: target.beat.id,
        instruction,
      })}
      onClose={onClose}
    />
  );
}
