import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";

export type CursorImageHoverItem = {
  image: string;
  label: ReactNode;
};

type CursorImageHoverProps = {
  items: CursorImageHoverItem[];
  className?: string;
  itemClassName?: string;
  imageClassName?: string;
  imageWidth?: number;
  imageHeight?: number;
  followDuration?: number;
  fadeDuration?: number;
  ease?: string;
};

export default function CursorImageHover({
  items,
  className,
  itemClassName,
  imageClassName,
  imageWidth = 350,
  imageHeight = 350,
  followDuration = 0.4,
  fadeDuration = 0.1,
  ease = "power3",
}: CursorImageHoverProps) {
  const containerRefs = useRef<(HTMLLIElement | null)[]>([]);
  const imageRefs = useRef<(HTMLImageElement | null)[]>([]);

  useEffect(() => {
    let firstEnter = true;
    const cleanups: Array<() => void> = [];

    containerRefs.current.forEach((el, i) => {
      const image = imageRefs.current[i];
      if (!el || !image) return;

      gsap.set(image, { yPercent: -50, xPercent: -50 });

      const setX = gsap.quickTo(image, "x", { duration: followDuration, ease });
      const setY = gsap.quickTo(image, "y", { duration: followDuration, ease });

      const align = (e: MouseEvent) => {
        if (firstEnter) {
          setX(e.clientX, e.clientX);
          setY(e.clientY, e.clientY);
          firstEnter = false;
        } else {
          setX(e.clientX);
          setY(e.clientY);
        }
      };

      const startFollow = () => document.addEventListener("mousemove", align);
      const stopFollow = () => document.removeEventListener("mousemove", align);

      const fade = gsap.to(image, {
        autoAlpha: 1,
        ease: "none",
        paused: true,
        duration: fadeDuration,
        onReverseComplete: stopFollow,
      });

      const onEnter = (e: MouseEvent) => {
        firstEnter = true;
        el.style.cursor = "none";
        fade.play();
        startFollow();
        align(e);
      };
      const onLeave = () => {
        el.style.cursor = "";
        fade.reverse();
      };

      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);

      cleanups.push(() => {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
        stopFollow();
        fade.kill();
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }, [items, followDuration, fadeDuration, ease]);

  return (
    <ul role="list" className={className}>
      {items.map((item, i) => (
        <li
          key={i}
          ref={(el) => {
            containerRefs.current[i] = el;
          }}
          className={itemClassName}
        >
          <img
            ref={(el) => {
              imageRefs.current[i] = el;
            }}
            className={imageClassName}
            src={item.image}
            alt=""
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: imageWidth,
              height: imageHeight,
              objectFit: "cover",
              zIndex: 9,
              opacity: 0,
              visibility: "hidden",
              pointerEvents: "none",
            }}
          />
          <div className="text">{item.label}</div>
        </li>
      ))}
    </ul>
  );
}
