import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQ = [
  {
    q: "O Olhar Singular faz diagnóstico?",
    a: "Não. A ferramenta trabalha exclusivamente com barreiras pedagógicas observáveis em sala de aula, sem qualquer diagnóstico clínico.",
  },
  {
    q: "Preciso de laudo para usar?",
    a: "Não. Você observa as dificuldades em sala e seleciona as barreiras. Nenhum documento clínico é necessário.",
  },
  {
    q: "Quanto vale 1 crédito?",
    a: "1 adaptação completa custa 3 créditos. Iniciar uma conversa com a ISA também custa 3 créditos. As mensagens seguintes na mesma conversa são gratuitas.",
  },
  {
    q: "Os créditos expiram?",
    a: "Nunca. Seus créditos ficam na conta indefinidamente, sem data de validade.",
  },
  {
    q: "A ferramenta substitui o professor?",
    a: "Nunca. Você é sempre o decisor final. Pode ajustar, ignorar ou complementar qualquer sugestão da IA.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
        aria-expanded={open}
      >
        <span className="font-semibold text-foreground text-sm">{q}</span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">{a}</div>
      )}
    </div>
  );
}

export default function FaqSection() {
  return (
    <section id="faq" className="py-16 lg:py-24 bg-secondary/30">
      <div className="max-w-3xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-3">Perguntas frequentes</h2>
        </div>
        <div className="space-y-3">
          {FAQ.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </div>
    </section>
  );
}
