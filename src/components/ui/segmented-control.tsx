import * as React from "react";
import { cn } from "~/lib/utils";

/** Frame for a row of `<Button variant="segment" size="xs">` options; mark the active one with aria-pressed. */
function SegmentedControl({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="segmented-control"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border p-0.5",
        className,
      )}
      {...props}
    />
  );
}

export { SegmentedControl };
