import { ArrowRight, Wand2 } from "lucide-react";

const STEPS = [
  {
    n: "01",
    title: "Selecione as barreiras",
    desc: "Escolha as barreiras pedagógicas observáveis do seu aluno — sem diagnóstico, sem laudo.",
  },
  {
    n: "02",
    title: "Cole sua atividade",
    desc: "Insira o texto da prova, exercício ou trabalho. Aceita até 10 000 caracteres.",
  },
  {
    n: "03",
    title: "Receba a adaptação",
    desc: "A IA gera a versão adaptada com justificativa pedagógica e orientações práticas.",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="como-funciona" className="py-16 lg:py-24 bg-background">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-foreground mb-3">Como funciona</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Três passos para criar uma adaptação pedagógica completa.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {STEPS.map((step, i) => (
            <div key={step.n} className="relative">
              <div className="bg-card rounded-xl p-8 border border-border text-center h-full shadow-card hover:shadow-card-hover transition-shadow">
                <span className="text-5xl font-extrabold text-primary/10 absolute top-4 right-6" aria-hidden="true">
                  {step.n}
                </span>
                <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center mx-auto mb-4">
                  <Wand2 className="w-6 h-6 text-primary-foreground" aria-hidden="true" />
                </div>
                <h3 className="font-bold text-foreground mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
              {i < STEPS.length - 1 && (
                <div className="hidden md:flex absolute top-1/2 -right-4 items-center justify-center text-primary" aria-hidden="true">
                  <ArrowRight className="w-5 h-5" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
