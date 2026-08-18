import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { Observer } from "gsap/Observer";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(Observer, SplitText);

export type ObserverSection = {
  background?: string;
  heading?: string;
  content?: ReactNode;
};

type ObserverSectionsProps = {
  sections: ObserverSection[];
  className?: string;
  duration?: number;
  stagger?: number;
  wheelSpeed?: number;
  loop?: boolean;
};

export default function ObserverSections({
  sections,
  className,
  duration = 1.25,
  stagger = 0.02,
  wheelSpeed = -1,
  loop = true,
}: ObserverSectionsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const outerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const bgRefs = useRef<(HTMLDivElement | null)[]>([]);
  const headingRefs = useRef<(HTMLHeadingElement | null)[]>([]);

  useEffect(() => {
    const sectionEls = sectionRefs.current.filter(Boolean) as HTMLElement[];
    const outerWrappers = outerRefs.current.filter(Boolean) as HTMLDivElement[];
    const innerWrappers = innerRefs.current.filter(Boolean) as HTMLDivElement[];
    const images = bgRefs.current.filter(Boolean) as HTMLDivElement[];
    const headings = headingRefs.current.filter(Boolean) as HTMLHeadingElement[];

    if (sectionEls.length === 0) return;

    let observer: Observer | undefined;
    let tl: gsap.core.Timeline | undefined;
    let splitHeadings: (SplitText | undefined)[] = [];
    let currentIndex = -1;
    let animating = false;
    const wrap = gsap.utils.wrap(0, sectionEls.length);

    const run = () => {
      splitHeadings = headings.map((h) =>
        h
          ? SplitText.create(h, { type: "chars,words,lines", linesClass: "clip-text" })
          : undefined,
      );

      gsap.set(outerWrappers, { yPercent: 100 });
      gsap.set(innerWrappers, { yPercent: -100 });

      const gotoSection = (index: number, direction: number) => {
        if (animating) return;

        const target = currentIndex + direction;
        if (!loop) {
          if (target < 0 || target > sectionEls.length - 1) return;
          index = target;
        } else {
          index = wrap(index);
        }
        animating = true;

        const fromTop = direction === -1;
        const dFactor = fromTop ? -1 : 1;

        tl?.kill();
        tl = gsap.timeline({
          defaults: { duration, ease: "power1.inOut" },
          onComplete: () => {
            animating = false;
          },
        });

        if (currentIndex >= 0) {
          gsap.set(sectionEls[currentIndex], { zIndex: 0 });
          tl.to(images[currentIndex], { yPercent: -15 * dFactor }).set(
            sectionEls[currentIndex],
            { autoAlpha: 0 },
          );
        }

        gsap.set(sectionEls[index], { autoAlpha: 1, zIndex: 1 });

        tl.fromTo(
          [outerWrappers[index], innerWrappers[index]],
          {
            yPercent: (i: number) => (i ? -100 * dFactor : 100 * dFactor),
          },
          { yPercent: 0 },
          0,
        )
          .fromTo(images[index], { yPercent: 15 * dFactor }, { yPercent: 0 }, 0);

        const split = splitHeadings[index];
        if (split) {
          tl.fromTo(
            split.chars,
            { autoAlpha: 0, yPercent: 150 * dFactor },
            {
              autoAlpha: 1,
              yPercent: 0,
              duration: 1,
              ease: "power2",
              stagger: { each: stagger, from: "random" },
            },
            0.2,
          );
        }

        currentIndex = index;
      };

      observer = Observer.create({
        type: "wheel,touch,pointer",
        wheelSpeed,
        onDown: () => !animating && gotoSection(currentIndex - 1, -1),
        onUp: () => !animating && gotoSection(currentIndex + 1, 1),
        tolerance: 10,
        preventDefault: true,
      });

      gotoSection(0, 1);
    };

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) fonts.ready.then(run);
    else run();

    return () => {
      observer?.kill();
      tl?.kill();
      splitHeadings.forEach((s) => s?.revert());
    };
  }, [sections, duration, stagger, wheelSpeed, loop]);

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ position: "relative", height: "100vh", overflow: "hidden" }}
    >
      {sections.map((s, i) => (
        <section
          key={i}
          ref={(el) => {
            sectionRefs.current[i] = el;
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            height: "100%",
            width: "100%",
            visibility: "hidden",
          }}
        >
          <div
            ref={(el) => {
              outerRefs.current[i] = el;
            }}
            style={{ width: "100%", height: "100%", overflow: "hidden" }}
          >
            <div
              ref={(el) => {
                innerRefs.current[i] = el;
              }}
              style={{ width: "100%", height: "100%", overflow: "hidden" }}
            >
              <div
                ref={(el) => {
                  bgRefs.current[i] = el;
                }}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: "100%",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  ...(s.background
                    ? {
                        backgroundImage: s.background,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : {}),
                }}
              >
                {s.content ??
                  (s.heading ? (
                    <h2
                      ref={(el) => {
                        headingRefs.current[i] = el;
                      }}
                      style={{
                        margin: 0,
                        textAlign: "center",
                        fontSize: "clamp(1rem, 6vw, 10rem)",
                        fontWeight: 600,
                        lineHeight: 1.2,
                        width: "90vw",
                        maxWidth: 1200,
                        color: "#fff",
                      }}
                    >
                      {s.heading}
                    </h2>
                  ) : null)}
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
