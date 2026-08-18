import { useEffect, useRef, type ElementType, type ReactNode, type Ref } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(SplitText, ScrollTrigger);

type SplitTextRevealProps = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  type?: "chars" | "words" | "lines" | string;
  mask?: "lines" | "words" | "chars" | false;
  yPercent?: number;
  stagger?: number;
  duration?: number;
  scrub?: boolean | number;
  start?: string;
  end?: string;
};

export default function SplitTextReveal({
  children,
  as: Tag = "h2",
  className,
  type = "words,lines",
  mask = "lines",
  yPercent = 120,
  stagger = 2,
  duration = 0.25,
  scrub = true,
  start = "clamp(top center)",
  end = "clamp(bottom center)",
}: SplitTextRevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let split: SplitText | undefined;

    const run = () => {
      gsap.set(el, { opacity: 1 });
      split = SplitText.create(el, {
        type,
        mask: "lines",
        linesClass: "line",
        autoSplit: true,
        onSplit: (instance) => {
          return gsap.from(instance.lines, {
            yPercent,
            duration,
            stagger,
            scrollTrigger: {
              trigger: el,
              scrub,
              start,
              end,
            },
          });
        },
      });
    };

    const ready = (document as Document & { fonts?: FontFaceSet }).fonts?.ready;

    if (ready) {
      ready.then(run);
    } else {
      run();
    }

    return () => {
      split?.revert();
      ScrollTrigger.getAll().forEach((t) => t.trigger === el && t.kill());
    };
  }, [type, mask, yPercent, stagger, duration, scrub, start, end]);

  return (
    <Tag ref={ref as Ref<HTMLElement>} className={className} style={{ opacity: 0 }}>
      {children}
    </Tag>
  );
}
