import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { CustomWiggle } from "gsap/CustomWiggle";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(CustomWiggle, CustomEase);

type MagneticButtonProps = {
  children: ReactNode;
  background?: string;
  className?: string;
  zoneClassName?: string;
  wiggle?: boolean;
  wiggles?: number;
  strength?: number;
  labelStrength?: number;
  overwrite?: boolean | "auto";
  duration?: number;
};

export default function MagneticButton({
  children,
  background = "linear-gradient(114.41deg, #0ae448 20.74%, #abff84 65.5%)",
  className,
  zoneClassName,
  wiggle = true,
  wiggles = 8,
  strength = 0.4,
  labelStrength = 0.24,
  overwrite = "auto",
  duration = 0.4,
}: MagneticButtonProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const zone = zoneRef.current;
    const btn = btnRef.current;
    const label = labelRef.current;
    if (!zone || !btn || !label) return;

    let wiggleTween: gsap.core.Tween | undefined;

    if (wiggle) {
      wiggleTween = gsap.to(btn, {
        rotation: 12,
        duration: 1.5,
        repeat: -1,
        ease: `wiggle({ wiggles: ${wiggles}, type: easeOut })`,
      });
    }

    const onMove = (e: MouseEvent) => {
      const rect = zone.getBoundingClientRect();
      const x = gsap.utils.mapRange(
        rect.left,
        rect.right,
        -rect.width / 2,
        rect.width / 2,
        e.clientX,
      );
      const y = gsap.utils.mapRange(
        rect.top,
        rect.bottom,
        -rect.height / 2,
        rect.height / 2,
        e.clientY,
      );

      gsap.to(btn, {
        x: x * strength,
        y: y * strength,
        duration,
        ease: "power2.out",
        overwrite,
      });

      gsap.to(label, {
        x: x * labelStrength,
        y: y * labelStrength,
        duration,
        ease: "power2.out",
        overwrite: true,
      });
    };

    const onLeave = () => {
      gsap.to(btn, {
        x: 0,
        y: 0,
        duration: 0.7,
        ease: "elastic.out(1, 0.4)",
        overwrite,
      });
      gsap.to(label, {
        x: 0,
        y: 0,
        duration: 0.7,
        ease: "elastic.out(1, 0.4)",
        overwrite: true,
      });
    };

    zone.addEventListener("mousemove", onMove);
    zone.addEventListener("mouseleave", onLeave);

    return () => {
      zone.removeEventListener("mousemove", onMove);
      zone.removeEventListener("mouseleave", onLeave);
      wiggleTween?.kill();
    };
  }, [wiggle, wiggles, strength, labelStrength, overwrite, duration]);

  return (
    <div
      ref={zoneRef}
      className={zoneClassName}
      style={{
        width: 200,
        height: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        border: "1px dashed #42433d",
        position: "relative",
        cursor: "pointer",
      }}
    >
      <button
        ref={btnRef}
        className={className}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px 32px",
          borderRadius: 99,
          border: "none",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "0.85rem",
          color: "#0e100f",
          overflow: "hidden",
          willChange: "transform",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 99,
            zIndex: 0,
            background,
          }}
        />
        <span ref={labelRef} style={{ position: "relative", zIndex: 1, pointerEvents: "none" }}>
          {children}
        </span>
      </button>
    </div>
  );
}
