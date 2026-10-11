import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "~/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        /** Ghost that stays muted until hovered: secondary actions and icon buttons. */
        quiet:
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        /** Quiet button for removing things; turns red on hover. */
        "quiet-destructive":
          "text-muted-foreground hover:bg-destructive/15 hover:text-destructive aria-pressed:bg-destructive/15 aria-pressed:text-destructive aria-pressed:ring-1 aria-pressed:ring-destructive/40",
        /** Dashed placeholder or drop zone, e.g. "+ Add a beat"; data-active highlights it (drag over). */
        dashed:
          "border border-dashed text-muted-foreground hover:border-foreground/30 hover:text-foreground data-[active=true]:border-sky-400 data-[active=true]:bg-sky-950/30 data-[active=true]:text-sky-200",
        /** One option in a segmented control; set aria-pressed on the selected one. */
        segment:
          "text-muted-foreground hover:text-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground",
        /** Controls in the present-mode dock, over slides; pair with size="pill". */
        dock: "text-neutral-200 hover:bg-white/10 hover:text-white aria-pressed:bg-white aria-pressed:text-neutral-950 data-[state=open]:bg-white/10 data-[state=open]:text-white",
        /** The main action in the present-mode dock. */
        "dock-primary": "bg-white text-neutral-950 hover:bg-neutral-200",
        /** A lone control floating over slides, e.g. in fullscreen. */
        overlay:
          "bg-neutral-950/70 text-neutral-100 shadow-2xl ring-1 ring-white/10 backdrop-blur-md hover:bg-neutral-900",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        pill: "h-10 rounded-full px-5 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
