import { Wand2, MessageSquare, Users, History } from "lucide-react";

const FEATURES = [
  {
    icon: Wand2,
    title: "Adaptação com IA",
    desc: "Transforme provas, exercícios e atividades em versões adaptadas em segundos.",
  },
  {
    icon: MessageSquare,
    title: "Chat com a ISA",
    desc: "Tire dúvidas pedagógicas sobre DUA e inclusão com sua assistente de IA.",
  },
  {
    icon: Users,
    title: "Perfis de barreira",
    desc: "Salve os perfis dos seus alunos e adapte com mais agilidade na próxima vez.",
  },
  {
    icon: History,
    title: "Histórico completo",
    desc: "Acesse e reutilize todas as suas adaptações anteriores a qualquer momento.",
  },
];

export default function FeaturesSection() {
  return (
    <section className="py-16 lg:py-24 bg-secondary/30">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-foreground mb-3">Tudo que você precisa</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Uma plataforma completa para adaptação inclusiva, do planejamento ao histórico.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-card rounded-xl p-6 border border-border shadow-card hover:shadow-card-hover transition-shadow text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <f.icon className="w-6 h-6 text-primary" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-foreground mb-2 text-sm">{f.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
