import isaImage from "@/assets/landing/isa.webp";

// Illustrative exchanges: the section labels them "Exemplo de conversa" so they
// read as a sample of tone, never as a promise of what the ISA will answer.
const CONVERSATIONS = [
  {
    question: "Tenho um aluno que não termina nenhuma prova. Por onde eu começo?",
    answer:
      "Uma boa porta de entrada é reduzir o número de questões por página e separar cada instrução em uma linha, mantendo a mesma exigência de conteúdo.",
  },
  {
    question: "Adaptar é facilitar? Estou diminuindo a exigência?",
    answer:
      "Não. Adaptar muda o caminho, não o destino. A pergunta continua a mesma; o que tiramos são as barreiras de leitura, formato ou tempo que impediam o aluno de mostrar o que sabe.",
  },
  {
    question: "A coordenação vai me pedir justificativa. O que eu apresento?",
    answer:
      "Cada adaptação registra a justificativa pedagógica das mudanças. Revise o texto, edite o que for preciso e leve para a coordenação.",
  },
];

// White text must hold 4.5:1 on every point of the gradient, so it runs only
// between the two deep teals (the design's bright #0FB5A0 start measured 2.58:1).
export default function IsaSection() {
  return (
    <section
      aria-labelledby="h-isa"
      className="lp-on-dark bg-gradient-to-br from-lp-teal-deep to-lp-teal-text px-5 py-[clamp(40px,6vw,80px)] text-white"
    >
      <div className="mx-auto grid max-w-[1160px] grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-center gap-[clamp(24px,4vw,48px)]">
        <div>
          <h2 id="h-isa" className="font-poppins text-[clamp(26px,4.4vw,38px)] text-pretty text-white">
            Conheça a ISA
          </h2>
          <p className="mt-4 text-lg text-white">
            A ISA é a assistente pedagógica do Olhar Singular. Ela responde suas dúvidas sobre DUA e inclusão em
            linguagem de sala de aula.
          </p>
          <p className="mt-4 text-base text-white">
            Cada conversa nova com a ISA custa 3 créditos; as mensagens seguintes da mesma conversa não custam, até o limite de mensagens por conversa indicado na tela.
          </p>
          <img
            src={isaImage}
            alt="Ilustração de uma assistente com tablet nas mãos e balões de conversa ao lado"
            width={584}
            height={880}
            loading="lazy"
            decoding="async"
            className="mt-6 h-auto w-full max-w-[292px] rounded-2xl border border-white/35"
          />
        </div>
        <div>
          <p className="font-poppins text-sm font-semibold uppercase tracking-wide text-white">Exemplo de conversa</p>
          <ul role="list" className="m-0 mt-4 flex list-none flex-col gap-5 p-0">
            {CONVERSATIONS.map((c) => (
              <li key={c.question} className="flex flex-col gap-2.5">
                <p className="max-w-[88%] self-end rounded-2xl rounded-br-sm border border-white/40 bg-lp-dark px-[18px] py-3.5 text-base text-white">
                  <span className="sr-only">Pergunta:</span> {c.question}
                </p>
                <p className="max-w-[92%] self-start rounded-2xl rounded-bl-sm bg-lp-surface px-[18px] py-4 text-base text-lp-ink shadow-[0_8px_22px_rgba(0,0,0,0.12)]">
                  <span className="sr-only">Resposta da ISA:</span> {c.answer}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
