import { Link } from "react-router-dom";
import { Wand2, User, Coins, MessageSquare, ArrowRight, Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

const quickActions = [
  {
    icon: Wand2,
    title: "Adaptar Atividade",
    description: "Crie adaptações inclusivas com IA",
    link: "/adaptar",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: User,
    title: "Perfis de Barreira",
    description: "Gerencie perfis de aprendizagem",
    link: "/perfis-barreira",
    color: "bg-accent/10 text-accent",
  },
  {
    icon: Coins,
    title: "Créditos",
    description: "Saldo e histórico de uso",
    link: "/creditos",
    color: "bg-secondary text-secondary-foreground",
  },
  {
    icon: MessageSquare,
    title: "Chat com IA",
    description: "Tire dúvidas pedagógicas",
    link: "/chat",
    color: "bg-muted text-muted-foreground",
  },
];

const tips = [
  { dimension: "Atenção", text: "Fragmente enunciados longos em frases curtas e diretas. Use marcadores visuais para destacar palavras-chave.", icon: "🎯" },
  { dimension: "Processamento", text: "Use analogias do cotidiano para explicar conceitos abstratos. Apresente exemplos antes da teoria.", icon: "🧠" },
  { dimension: "Engajamento", text: "Comece com o que o aluno já sabe. O sucesso inicial aumenta a motivação para continuar.", icon: "🚀" },
  { dimension: "Ritmo", text: "Ofereça atividades com níveis progressivos de dificuldade. Permita que o aluno avance no seu próprio ritmo.", icon: "⏱️" },
];

export default function DashboardPage() {
  const { profile, user, signOut } = useAuth();

  const displayName =
    profile?.full_name || user?.user_metadata?.full_name || "Professor(a)";

  const todayTip = tips[new Date().getDate() % tips.length];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
      {/* Greeting */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Olá, {displayName}!
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Bem-vindo ao Olhar Singular.
          </p>
        </div>
        <button
          onClick={signOut}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          Sair
        </button>
      </div>

      {/* Credit balance card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Coins className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Créditos disponíveis</p>
              <p className="text-3xl font-bold text-foreground tabular-nums">
                {profile?.credit_balance ?? "—"}
              </p>
            </div>
          </div>
          <Link
            to="/creditos"
            className="text-sm text-primary font-medium hover:underline flex items-center gap-1"
          >
            Comprar
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div>
        <h2 className="font-semibold text-foreground mb-4">Ações Rápidas</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {quickActions.map((action) => (
            <Link key={action.link} to={action.link}>
              <Card className="h-full hover:shadow-[var(--card-shadow-hover)] transition-shadow cursor-pointer border-border group">
                <CardContent className="p-5">
                  <div
                    className={`w-10 h-10 rounded-lg ${action.color} flex items-center justify-center mb-3`}
                  >
                    <action.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-foreground text-sm mb-1 flex items-center gap-1">
                    {action.title}
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                  </h3>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Tip of the day */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5 flex items-start gap-4">
          <span className="text-3xl">{todayTip.icon}</span>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Lightbulb className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">
                Dica Pedagógica do Dia
              </h3>
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {todayTip.dimension}
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {todayTip.text}
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Ferramenta pedagógica. Não realiza diagnóstico. A decisão final é sempre do profissional.
      </p>
    </div>
  );
}
