import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

type ScrollCarouselProps = {
  children: ReactNode;
  className?: string;
  sectionClassName?: string;
  direction?: "horizontal" | "vertical";
  scrub?: boolean | number;
};

export default function ScrollCarousel({
  children,
  className,
  sectionClassName,
  direction = "horizontal",
  scrub = 1,
}: ScrollCarouselProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      const track = trackRef.current;
      if (!root || !track) return;

      const sections = gsap.utils.toArray<HTMLElement>(track.children);
      if (sections.length <= 1) return;

      const horizontal = direction === "horizontal";

      const tween = horizontal
        ? { xPercent: -100 * (sections.length - 1) }
        : { yPercent: -100 * (sections.length - 1) };

      const distance = () =>
        horizontal
          ? track.scrollWidth - window.innerWidth
          : track.scrollHeight - window.innerHeight;

      gsap.to(track, {
        ...tween,
        ease: "none",
        scrollTrigger: {
          trigger: root,
          pin: true,
          scrub,
          start: "top top",
          end: () => "+=" + distance(),
          invalidateOnRefresh: true,
        },
      });

      ScrollTrigger.refresh();
    },
    { scope: rootRef, dependencies: [direction, scrub] },
  );

  return (
    <div ref={rootRef} className={className} style={{ overflow: "hidden" }}>
      <div
        ref={trackRef}
        className="flex"
        style={
          direction === "horizontal"
            ? { flexWrap: "nowrap", height: "100vh" }
            : { flexWrap: "nowrap", flexDirection: "column", width: "100%" }
        }
      >
        {Array.isArray(children)
          ? children.map((child, i) => (
              <section
                key={i}
                className={sectionClassName}
                style={
                  direction === "horizontal"
                    ? { flex: "0 0 100vw", height: "100vh" }
                    : { flex: "0 0 100vh", width: "100vw" }
                }
              >
                {child}
              </section>
            ))
          : children}
      </div>
    </div>
  );
}
