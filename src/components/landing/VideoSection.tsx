import { useRef } from "react";
import posterDepoimento from "@/assets/landing/video-depoimento.webp";
import posterMito from "@/assets/landing/video-mito.webp";
import { supabase } from "@/integrations/supabase/client";
import { trackVideoPlay, type LandingVideoId } from "@/lib/analytics/events";

// The clips live in the public `landing` Storage bucket (migration
// 20261026132823): 21 MB of MP4 would weigh on every clone and build if they
// were committed. The CSP media-src allows 'self' and *.supabase.co only, so no
// external player could be embedded here. The clips carry their own captions
// burned into the picture and need no text around them; `title` only names the
// video for assistive technology.
interface LandingVideo {
  id: LandingVideoId;
  title: string;
  poster: string;
}

const VIDEOS: LandingVideo[] = [
  { id: "depoimento", title: "Depoimento de uma professora sobre adaptar à mão", poster: posterDepoimento },
  { id: "mito", title: "O mito de que adaptar é subestimar o aluno", poster: posterMito },
];

function videoSrc(id: LandingVideoId): string {
  return supabase.storage.from("landing").getPublicUrl(`videos/${id}.mp4`).data.publicUrl;
}

export default function VideoSection() {
  const players = useRef(new Map<LandingVideoId, HTMLVideoElement>());
  const played = useRef(new Set<LandingVideoId>());

  function register(id: LandingVideoId, el: HTMLVideoElement | null) {
    if (el) players.current.set(id, el);
    else players.current.delete(id);
  }

  // One clip at a time, and one video_play per clip per page view (pause/resume
  // fires `play` again and must not count twice).
  function handlePlay(id: LandingVideoId) {
    players.current.forEach((el, otherId) => {
      if (otherId !== id) el.pause();
    });
    if (!played.current.has(id)) {
      played.current.add(id);
      trackVideoPlay(id);
    }
  }

  return (
    <section aria-labelledby="h-videos" className="px-5 py-[clamp(40px,6vw,80px)]">
      <div className="mx-auto max-w-[1160px]">
        <h2 id="h-videos" className="font-poppins text-pretty text-center text-[clamp(26px,4.4vw,38px)] text-lp-ink">
          Veja em vídeo
        </h2>
        <ul
          role="list"
          className="mx-auto mb-0 mt-8 grid max-w-[760px] list-none grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-6 p-0"
        >
          {VIDEOS.map((video) => (
            <li key={video.id}>
              <video
                ref={(el) => register(video.id, el)}
                controls
                preload="none"
                playsInline
                poster={video.poster}
                src={videoSrc(video.id)}
                aria-label={video.title}
                width={720}
                height={1280}
                onPlay={() => handlePlay(video.id)}
                className="aspect-[9/16] w-full rounded-2xl bg-lp-dark object-cover shadow-[0_18px_50px_rgba(10,127,135,0.18)]"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
