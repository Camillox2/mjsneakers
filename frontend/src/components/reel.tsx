import { useEffect, useRef, useState } from "react";
import { DROPS } from "@/lib/catalog";
import { packedUrl } from "@/lib/packed-media";

const STAGE = {
  violeta: "bg-stage-violeta",
  cobalto: "bg-stage-cobalto",
  noite: "bg-stage-noite",
} as const;

type StageId = keyof typeof STAGE;

type Props = {
  onReserve: (id: string) => void;
};

function weights(progress: number, count: number) {
  if (progress <= 0.001) return DROPS.map((_, index) => (index === 0 ? 1 : 0));
  if (progress >= 0.999) return DROPS.map((_, index) => (index === count - 1 ? 1 : 0));
  const raw = DROPS.map((_, index) => {
    const center = (index + 0.5) / count;
    const width = (1 / count) * 0.96;
    return Math.max(0, 1 - Math.abs(progress - center) / width);
  });
  const max = Math.max(...raw, 0.0001);
  return raw.map((value) => value / max);
}

export function Reel({ onReserve }: Props) {
  const trackRef = useRef<HTMLElement>(null);
  const frameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [index, setIndex] = useState(0);
  const [spins, setSpins] = useState<Record<string, string>>({});
  const drop = DROPS[index];

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const track = trackRef.current;
    if (!track) return;

    const count = DROPS.length;
    const shown = DROPS.map((_, index) => (index === 0 ? 1 : 0));
    const held = DROPS.map(() => -1);
    const busy = DROPS.map(() => false);
    const queued = DROPS.map(() => -1);
    let raw = 0;
    let smooth = 0;
    let running = true;

    const read = () => {
      const total = track.offsetHeight - window.innerHeight;
      const scrolled = Math.min(Math.max(-track.getBoundingClientRect().top, 0), Math.max(total, 0));
      raw = total > 0 ? scrolled / total : 0;
    };

    const seek = (video: HTMLVideoElement, index: number, frame: number, time: number) => {
      queued[index] = frame;
      if (busy[index]) return;
      const pump = () => {
        const next = queued[index];
        if (next < 0 || next === held[index]) {
          busy[index] = false;
          return;
        }
        held[index] = next;
        const target = Math.min(video.duration - 1 / 24, next / 24);
        if (Math.abs(video.currentTime - target) < 0.02) {
          busy[index] = false;
          return;
        }
        busy[index] = true;
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          busy[index] = false;
          pump();
        };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = target;
      };
      if (Math.abs(video.currentTime - time) < 0.02 && held[index] === frame) return;
      pump();
    };

    let raf = 0;
    const tick = () => {
      if (!running) return;
      read();
      const follow = reduced ? 1 : 0.2;
      smooth += (raw - smooth) * follow;
      if (Math.abs(raw - smooth) < 0.00015) smooth = raw;
      document.documentElement.style.setProperty("--p", smooth.toFixed(4));
      const next = Math.min(count - 1, Math.floor(Math.min(0.9999, smooth) * count));
      setIndex((current) => (current === next ? current : next));
      const mix = weights(smooth, count);
      mix.forEach((weight, i) => {
        shown[i] += (weight - shown[i]) * (reduced ? 1 : 0.18);
        const node = frameRefs.current[i];
        if (node) node.style.opacity = shown[i].toFixed(4);
        if (reduced || shown[i] < 0.02) return;
        const video = videoRefs.current[i];
        if (!video || video.readyState < 2) return;
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0.2) return;
        const frames = Math.max(1, Math.round(duration * 24) - 1);
        const spin = Math.min(1, Math.max(0, smooth * count - i));
        const frame = Math.round(spin * frames);
        seek(video, i, frame, Math.min(duration - 1 / 24, frame / 24));
      });
      raf = window.requestAnimationFrame(tick);
    };

    read();
    raf = window.requestAnimationFrame(tick);
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, []);

  useEffect(() => {
    let dead = false;
    DROPS.forEach((item) => {
      packedUrl(`/drops/${item.id}.mp4`).then((url) => {
        if (!dead && url !== `/drops/${item.id}.mp4`) setSpins((current) => ({ ...current, [item.id]: url }));
      });
    });
    return () => {
      dead = true;
    };
  }, []);

  const jump = (target: number) => {
    const track = trackRef.current;
    if (!track) return;
    const total = track.offsetHeight - window.innerHeight;
    const progress = (target + 0.42) / DROPS.length;
    const top = track.getBoundingClientRect().top + window.scrollY + total * progress;
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <section ref={trackRef} className="reel relative" aria-label="Vitrine">
      <div className={`reel-stage sticky top-0 h-dvh overflow-hidden ${STAGE[drop.id as StageId]}`} data-tone={drop.tone}>
        {DROPS.map((item, i) => (
          <div
            key={item.id}
            ref={(node) => {
              frameRefs.current[i] = node;
            }}
            className="reel-frame absolute inset-0"
          >
            <video
              ref={(node) => {
                videoRefs.current[i] = node;
              }}
              src={spins[item.id] ?? `/drops/${item.id}.mp4`}
              poster={item.image}
              muted
              playsInline
              preload="auto"
              disablePictureInPicture
              aria-hidden="true"
              className="reel-video"
              onLoadedMetadata={(event) => event.currentTarget.pause()}
            />
          </div>
        ))}

        <div className="relative z-10 flex h-full flex-col px-5 pt-24 pb-8 md:px-10">
          <div key={drop.id} className="reel-copy max-w-xl">
            <p className="font-display text-xs tracking-[0.28em] uppercase opacity-80">
              0{index + 1} / 0{DROPS.length} · {drop.brand}
            </p>
            <h1 className="font-display mt-2 text-4xl leading-none font-extrabold sm:text-5xl md:mt-3 md:text-7xl">{drop.name}</h1>
            <p className="mt-3 max-w-xs text-sm leading-relaxed sm:text-base md:mt-4 md:max-w-sm md:text-lg">{drop.line}</p>
            <ul className="mt-5 hidden space-y-1 text-sm md:block">
              <li>
                <span className="opacity-60">Sola </span>
                <span className="font-display text-lg">{drop.sole}</span>
              </li>
              <li>
                <span className="opacity-60">Cadarço </span>
                <span className="font-display text-lg">{drop.lace}</span>
              </li>
              <li>
                <span className="opacity-60">Código </span>
                <span className="font-display text-lg">{drop.code}</span>
              </li>
            </ul>
            <button
              type="button"
              className="press mt-6 inline-flex h-12 items-center bg-acid px-5 text-sm font-semibold tracking-wide text-ink"
              onClick={() => onReserve(drop.id)}
            >
              Reservar este exemplar
            </button>
          </div>

          <div className="relative z-10 mt-auto flex justify-center gap-2 md:justify-end">
            {DROPS.map((item, i) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Ver ${item.brand} ${item.name}`}
                aria-current={i === index}
                onClick={() => jump(i)}
                className={`press h-11 min-w-11 border px-3 text-xs font-semibold tracking-widest ${
                  i === index ? "border-acid bg-acid text-ink" : "border-current/40 bg-bg/45"
                }`}
              >
                0{i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
