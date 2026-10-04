import { useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface ProofImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

interface ProofSectionProps {
  beforeImage?: ProofImage;
  afterImage?: ProofImage;
}

type VersionKey = "original" | "adaptada";

// Order matters: it is the DOM order of the panels and the arrow-key order of the tabs.
const VERSIONS: ReadonlyArray<{
  key: VersionKey;
  tabLabel: string;
  caption: string;
  captionClass: string;
  frameClass: string;
  patternClass: string;
  placeholder: string;
}> = [
  {
    key: "original",
    tabLabel: "Original",
    caption: "Antes: atividade original",
    captionClass: "text-lp-muted",
    frameClass: "border border-lp-border",
    patternClass: "bg-[repeating-linear-gradient(135deg,#F2F6F6_0_12px,#EAF1F1_12px_24px)]",
    placeholder: "Imagem da atividade original",
  },
  {
    key: "adaptada",
    tabLabel: "Adaptada",
    caption: "Depois: versão adaptada",
    captionClass: "text-lp-teal-text",
    frameClass: "border-2 border-lp-teal shadow-[0_10px_30px_rgba(15,181,160,0.18)]",
    patternClass: "bg-[repeating-linear-gradient(135deg,#EAF7F5_0_12px,#E1F2EF_12px_24px)]",
    placeholder: "Imagem da atividade adaptada",
  },
];

// Illustrative only: each example DESCRIBES a change the adapted document can carry. It never
// asserts an effect on the student, and none of the three is promised for every adaptation.
const EXAMPLES = [
  {
    tag: "01 · Enunciado",
    title: "Frases curtas, uma instrução por linha",
    description: "O enunciado é reescrito em frases curtas e cada instrução ocupa a sua própria linha.",
  },
  {
    tag: "02 · Vocabulário",
    title: "Termo-chave com destaque visual",
    description: "O termo-chave da questão recebe um destaque visual e uma explicação curta ao lado.",
  },
  {
    tag: "03 · Resposta",
    title: "Exemplo resolvido antes da pergunta",
    description: "Um exemplo resolvido aparece antes da questão, mostrando como a resposta é organizada.",
  },
];

const TAB_BASE =
  "min-h-[44px] rounded-[10px] px-[22px] py-2.5 font-poppins text-[15px] font-semibold transition-colors motion-reduce:transition-none";

export default function ProofSection({ beforeImage, afterImage }: ProofSectionProps) {
  const [active, setActive] = useState<VersionKey>("adaptada");
  const tabRefs = useRef<HTMLButtonElement[]>([]);
  const images: Record<VersionKey, ProofImage | undefined> = { original: beforeImage, adaptada: afterImage };

  const select = (index: number) => {
    setActive(VERSIONS[index].key);
    tabRefs.current[index].focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = VERSIONS.length - 1;
    let next: number;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    select(next);
  };

  return (
    <section
      id="prova"
      aria-labelledby="h-prova"
      className="border-y border-lp-border bg-lp-surface px-5 py-10 sm:py-16 lg:py-20"
    >
      <div className="mx-auto max-w-[1160px]">
        <h2 id="h-prova" className="text-pretty text-center font-poppins text-[clamp(26px,4.4vw,38px)] text-lp-ink">
          Veja o que a IA entrega
        </h2>
        <p className="mx-auto mt-3.5 max-w-[660px] text-center text-lp-ink-2">
          A mesma atividade em duas versões: a original e a adaptada para as barreiras do aluno.
        </p>

        {/* Tabs only exist below 760px, where one panel shows at a time. The wrapper alone hides the
            whole row (margin included), by CSS and never the `hidden` attribute, so the chosen tab
            survives a resize across 760px. */}
        <div className="mt-7 flex justify-center min-[760px]:hidden">
          <div
            role="tablist"
            aria-label="Escolher versão da atividade"
            className="inline-flex gap-1.5 rounded-[14px] bg-lp-teal-tint p-1.5"
          >
            {VERSIONS.map((version, index) => {
              const selected = active === version.key;
              return (
                <button
                  key={version.key}
                  ref={(el) => {
                    if (el) tabRefs.current[index] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`prova-tab-${version.key}`}
                  aria-selected={selected}
                  aria-controls={`prova-panel-${version.key}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(version.key)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  className={cn(
                    TAB_BASE,
                    selected
                      ? "bg-lp-surface text-lp-teal-text shadow-[0_2px_8px_rgba(22,40,43,0.12)]"
                      : "bg-transparent text-lp-ink-2",
                  )}
                >
                  {version.tabLabel}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 items-start gap-6 min-[760px]:grid-cols-2">
          {VERSIONS.map((version) => {
            const image = images[version.key];
            return (
              <div
                key={version.key}
                role="tabpanel"
                id={`prova-panel-${version.key}`}
                aria-labelledby={`prova-tab-${version.key}`}
                className={cn(active !== version.key && "max-[759px]:hidden")}
              >
                <p
                  className={cn(
                    "mb-2.5 font-poppins text-sm font-semibold uppercase tracking-[0.05em]",
                    version.captionClass,
                  )}
                >
                  {version.caption}
                </p>
                {image ? (
                  <img
                    src={image.src}
                    alt={image.alt}
                    width={image.width}
                    height={image.height}
                    loading="lazy"
                    decoding="async"
                    className={cn("h-auto w-full rounded-2xl", version.frameClass)}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className={cn(
                      "flex aspect-[4/5] items-end rounded-2xl p-3.5",
                      version.frameClass,
                      version.patternClass,
                    )}
                  >
                    <span className="rounded-lg bg-lp-surface px-2.5 py-1.5 text-xs text-lp-ink-2">
                      {version.placeholder}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-[660px] text-center text-lp-ink-2">
          A IA registra a justificativa pedagógica das mudanças que faz. Exemplos de mudanças que uma adaptação
          pode trazer:
        </p>
        <ol
          role="list"
          className="mt-5 grid list-none grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4 p-0"
        >
          {EXAMPLES.map((example) => (
            <li
              key={example.tag}
              className="rounded-2xl border border-l-4 border-lp-border border-l-lp-teal bg-lp-bg px-5 py-[18px]"
            >
              <p className="flex items-center gap-2 font-poppins text-[13px] font-semibold tracking-[0.04em] text-lp-teal-text">
                <span className="rounded-full bg-lp-teal-tint px-2 py-0.5">Exemplo</span>
                <span>{example.tag}</span>
              </p>
              <h3 className="mt-1.5 font-poppins text-lg text-lp-ink">{example.title}</h3>
              <p className="mt-2 text-[15px] text-lp-ink-2">{example.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
