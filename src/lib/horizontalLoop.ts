import gsap from "gsap";

export interface HorizontalLoopTimeline extends gsap.core.Timeline {
  next: (vars?: gsap.TweenVars) => gsap.core.Tween;
  previous: (vars?: gsap.TweenVars) => gsap.core.Tween;
  toIndex: (index: number, vars?: gsap.TweenVars) => gsap.core.Tween;
  current: () => number;
  times: number[];
}

export interface HorizontalLoopConfig {
  speed?: number;
  paused?: boolean;
  repeat?: number;
  reversed?: boolean;
  paddingRight?: number;
  snap?: number | false;
}

export function horizontalLoop(
  items: Element[] | NodeListOf<Element> | string,
  config: HorizontalLoopConfig = {},
): HorizontalLoopTimeline {
  const els = gsap.utils.toArray<HTMLElement>(items);
  const conf = config;

  const tl = gsap.timeline({
    repeat: conf.repeat,
    paused: conf.paused,
    defaults: { ease: "none" },
    onReverseComplete: () => tl.totalTime(tl.rawTime() + tl.duration() * 100),
  }) as HorizontalLoopTimeline;

  const length = els.length;
  const startX = els[0].offsetLeft;
  const widths: number[] = [];
  const xPercents: number[] = [];
  const times: number[] = [];
  let curIndex = 0;
  const pixelsPerSecond = (conf.speed || 1) * 100;
  const snap =
    conf.snap === false
      ? (v: number) => v
      : gsap.utils.snap(conf.snap || 1);
  let totalWidth: number;
  let curX: number;
  let distanceToStart: number;
  let distanceToLoop: number;
  let item: HTMLElement;
  let i: number;

  gsap.set(els, {
    xPercent: (idx: number, el: Element) => {
      const w = (widths[idx] = parseFloat(gsap.getProperty(el, "width", "px") as string));
      xPercents[idx] = snap(
        (parseFloat(gsap.getProperty(el, "x", "px") as string) / w) * 100 +
          (gsap.getProperty(el, "xPercent") as number),
      );
      return xPercents[idx];
    },
  });
  gsap.set(els, { x: 0 });

  totalWidth =
    els[length - 1].offsetLeft +
    (xPercents[length - 1] / 100) * widths[length - 1] -
    startX +
    els[length - 1].offsetWidth * (gsap.getProperty(els[length - 1], "scaleX") as number) +
    (Number(conf.paddingRight) || 0);

  for (i = 0; i < length; i++) {
    item = els[i];
    curX = (xPercents[i] / 100) * widths[i];
    distanceToStart = item.offsetLeft + curX - startX;
    distanceToLoop = distanceToStart + widths[i] * (gsap.getProperty(item, "scaleX") as number);

    tl.to(
      item,
      {
        xPercent: snap(((curX - distanceToLoop) / widths[i]) * 100),
        duration: distanceToLoop / pixelsPerSecond,
      },
      0,
    )
      .fromTo(
        item,
        { xPercent: snap(((curX - distanceToLoop + totalWidth) / widths[i]) * 100) },
        {
          xPercent: xPercents[i],
          duration: (curX - distanceToLoop + totalWidth - curX) / pixelsPerSecond,
          immediateRender: false,
        },
        distanceToLoop / pixelsPerSecond,
      )
      .add("label" + i, distanceToStart / pixelsPerSecond);

    times[i] = distanceToStart / pixelsPerSecond;
  }

  const toIndex = (index: number, vars?: gsap.TweenVars) => {
    const v = vars || {};
    if (Math.abs(index - curIndex) > length / 2) {
      index += index > curIndex ? -length : length;
    }
    const newIndex = gsap.utils.wrap(0, length, index);
    let time = times[newIndex];
    if (time > tl.time() !== index > curIndex) {
      v.modifiers = { time: gsap.utils.wrap(0, tl.duration()) };
      time += tl.duration() * (index > curIndex ? 1 : -1);
    }
    curIndex = newIndex;
    v.overwrite = true;
    return tl.tweenTo(time, v);
  };

  tl.next = (vars?: gsap.TweenVars) => toIndex(curIndex + 1, vars);
  tl.previous = (vars?: gsap.TweenVars) => toIndex(curIndex - 1, vars);
  tl.current = () => curIndex;
  tl.toIndex = (index: number, vars?: gsap.TweenVars) => toIndex(index, vars);
  tl.times = times;

  tl.progress(1, true).progress(0, true);

  if (conf.reversed) {
    (tl.vars.onReverseComplete as (() => void) | undefined)?.();
    tl.reverse();
  }

  return tl;
}
