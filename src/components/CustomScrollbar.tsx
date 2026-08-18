import { useEffect, useRef } from "react";

type CustomScrollbarProps = {
  width?: number;
  right?: number;
  color?: string;
  thumbColor?: string;
  thumbRadius?: number;
  minThumb?: number;
  hideNativeScrollbar?: boolean;
};

export default function CustomScrollbar({
  width = 24,
  right = 8,
  color = "rgba(255,255,255,0.08)",
  thumbColor = "#0ae448",
  thumbRadius = 12,
  minThumb = 60,
  hideNativeScrollbar = true,
}: CustomScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startThumbYRef = useRef(0);

  useEffect(() => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;

    const metrics = () => {
      const scrollHeight = document.documentElement.scrollHeight;
      const viewport = window.innerHeight;
      const maxScroll = Math.max(0, scrollHeight - viewport);
      const trackH = track.clientHeight;
      const thumbH = Math.min(trackH, Math.max(minThumb, (viewport / scrollHeight) * trackH));
      return { scrollHeight, viewport, maxScroll, trackH, thumbH };
    };

    const update = () => {
      const { maxScroll, trackH, thumbH } = metrics();
      thumb.style.height = `${thumbH}px`;
      const y = maxScroll > 0 ? (window.scrollY / maxScroll) * (trackH - thumbH) : 0;
      thumb.style.transform = `translateY(${y}px)`;
      track.style.opacity = maxScroll > 0 ? "1" : "0";
    };

    const onDown = (e: PointerEvent) => {
      draggingRef.current = true;
      startYRef.current = e.clientY;
      startThumbYRef.current = parseFloat(
        (thumb.style.transform.match(/-?[\d.]+/)?.[0] as string) || "0",
      );
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const { maxScroll, trackH, thumbH } = metrics();
      const delta = e.clientY - startYRef.current;
      const y = Math.min(Math.max(0, startThumbYRef.current + delta), trackH - thumbH);
      thumb.style.transform = `translateY(${y}px)`;
      window.scrollTo(0, (y / (trackH - thumbH)) * maxScroll);
    };

    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    thumb.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();

    return () => {
      thumb.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [minThumb]);

  return (
    <>
      {hideNativeScrollbar && (
        <style>{`html{scrollbar-width:none}html::-webkit-scrollbar{width:0;height:0}`}</style>
      )}
      <div
        ref={trackRef}
        style={{
          position: "fixed",
          top: 0,
          right,
          width: "40px",
          height: "40vh",
          background: color,
          borderRadius: width,
          zIndex: 9999,
          opacity: 0,
          transition: "opacity 0.2s",
        }}
      >
        <div
          ref={thumbRef}
          style={{
            position: "absolute",
            top: 0,
            left: "15%",
            width: "70%",
            borderRadius: thumbRadius,
            background: thumbColor,
            cursor: "grab",
            willChange: "transform",
          }}
        />
      </div>
    </>
  );
}
