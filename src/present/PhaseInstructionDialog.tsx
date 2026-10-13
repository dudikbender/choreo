import type { PhaseRange } from "~/engine/timeline";
import { InstructionDialog } from "./InstructionDialog";

export function PhaseInstructionDialog({
  presentationId,
  phase,
  onClose,
}: {
  presentationId: string;
  phase: PhaseRange;
  onClose: () => void;
}) {
  return (
    <InstructionDialog
      presentationId={presentationId}
      title={<>Instruct Choreo about “{phase.label}”</>}
      description={
        <>
          Phase <span className="font-mono">{phase.id}</span> · offsets{" "}
          <span className="font-mono">
            {phase.start.toLocaleString()}–{phase.end.toLocaleString()}
          </span>
          . Choreo gets this beat, its transition, and the choreography of
          everything on stage during it.
        </>
      }
      placeholder="Hold the headline longer here, and bring the chart in from below before the next beat."
      history={{ phase: phase.id }}
      buildRequest={(instruction) => ({
        mode: "phase",
        id: presentationId,
        phase: phase.id,
        instruction,
      })}
      onClose={onClose}
    />
  );
}
