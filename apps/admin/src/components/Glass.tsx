import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type PropsWithChildren,
} from "react";

export type GlassMaterial = "thin" | "standard" | "optical" | "elevated";

function glassClass(material: GlassMaterial, className?: string): string {
  return ["glass-surface", `glass-${material}`, className]
    .filter(Boolean)
    .join(" ");
}

type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  material?: GlassMaterial;
};

export const GlassSurface = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ material = "standard", className, ...props }, ref) => (
    <div
      ref={ref}
      className={glassClass(material, className)}
      data-glass={material}
      {...props}
    />
  ),
);
GlassSurface.displayName = "GlassSurface";

export function GlassNav({
  material = "standard",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { material?: GlassMaterial }) {
  return (
    <nav
      className={glassClass(material, className)}
      data-glass={material}
      {...props}
    />
  );
}

export const GlassToolbar = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ material = "standard", className, ...props }, ref) => (
    <div
      ref={ref}
      className={glassClass(material, className)}
      data-glass={material}
      {...props}
    />
  ),
);
GlassToolbar.displayName = "GlassToolbar";

export const GlassDialog = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ material = "elevated", className, ...props }, ref) => (
    <div
      ref={ref}
      className={glassClass(material, className)}
      data-glass={material}
      {...props}
    />
  ),
);
GlassDialog.displayName = "GlassDialog";

export const GlassPopover = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ material = "elevated", className, ...props }, ref) => (
    <div
      ref={ref}
      className={glassClass(material, className)}
      data-glass={material}
      {...props}
    />
  ),
);
GlassPopover.displayName = "GlassPopover";

export function GlassSegmentedControl({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={glassClass("thin", className)}
      data-glass="thin"
      {...props}
    />
  );
}

export function GlassSheet({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={glassClass("elevated", className)}
      data-glass="elevated"
      {...props}
    />
  );
}

export const GlassButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { material?: GlassMaterial }
>(({ material = "thin", className, ...props }, ref) => (
  <button
    ref={ref}
    className={glassClass(material, className)}
    data-glass={material}
    {...props}
  />
));
GlassButton.displayName = "GlassButton";

export function LiquidGlassDefs({ children }: PropsWithChildren) {
  return (
    <>
      <svg
        className="liquid-glass-defs"
        width="0"
        height="0"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <filter
            id="pagevault-liquid-refraction"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.008 0.012"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feGaussianBlur in="noise" stdDeviation="2" result="softNoise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="softNoise"
              scale="14"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      {children}
    </>
  );
}
