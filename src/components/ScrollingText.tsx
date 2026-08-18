import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { Observer } from "gsap/Observer";
import { horizontalLoop, type HorizontalLoopTimeline } from "../lib/horizontalLoop";

gsap.registerPlugin(Observer);

type ScrollingTextProps = {
  items: ReactNode[];
  className?: string;
  railClassName?: string;
  itemClassName?: string;
  paddingRight?: number;
  speed?: number;
  fontSize?: number | string;
  background?: string;
};

export default function ScrollingText({
  items,
  className,
  railClassName,
  itemClassName,
  paddingRight = 30,
  speed = 1,
  fontSize = 100,
  background = "#0e100f",
}: ScrollingTextProps) {
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const els = gsap.utils.toArray<HTMLElement>(rail.children);
    if (els.length === 0) return;

    const loop: HorizontalLoopTimeline = horizontalLoop(els, {
      repeat: -1,
      paddingRight,
      speed,
    });

    const observer = Observer.create({
      type: "wheel,touch,pointer",
      onChangeY(self) {
        let factor = 2.5;
        if (self.deltaY < 0) factor *= -1;
        gsap
          .timeline({ defaults: { ease: "none" } })
          .to(loop, { timeScale: factor * 2.5, duration: 0.2, overwrite: true })
          .to(loop, { timeScale: factor / 2.5, duration: 1 }, "+=0.3");
      },
    });

    return () => {
      observer.kill();
      loop.kill();
    };
  }, [items, paddingRight, speed]);

  return (
    <div
      className={className}
      style={{
        overflow: "hidden",
        width: "100%",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        backgroundColor: background,
      }}
    >
      <div ref={railRef} className={railClassName} style={{ display: "flex" }}>
        {items.map((item, i) => (
          <div
            key={i}
            className={itemClassName}
            style={{
              whiteSpace: "nowrap",
              fontWeight: 900,
              lineHeight: 1,
              marginRight: paddingRight,
              fontSize,
              color: "#fff",
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
