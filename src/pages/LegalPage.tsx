import { Link, useLocation } from "react-router-dom";
import PublicShell from "@/components/common/PublicShell";
import { TERMS_VERSION } from "@/lib/domain/subscriptionUi";
import { isLegalSlug, LEGAL_DOCS, type LegalSlug } from "@/lib/domain/legalDocs";

export default function LegalPage() {
  const slug = useLocation().pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  const doc = isLegalSlug(slug) ? LEGAL_DOCS[slug] : null;

  return (
    <PublicShell>
      <article className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        {!doc ? (
          <>
            <h1 className="text-2xl font-bold text-foreground">Página não encontrada</h1>
            <Link to="/" className="underline text-sm">
              Voltar ao início
            </Link>
          </>
        ) : (
          <>
            <header className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground">{doc.title}</h1>
              <p className="text-muted-foreground">{doc.intro}</p>
              <p role="note" className="text-xs rounded-md bg-amber-50 text-amber-900 px-3 py-2">
                Rascunho em revisão jurídica. Versão {TERMS_VERSION}.
              </p>
            </header>
            {doc.sections.map((section) => (
              <section key={section.title} className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
                {section.paragraphs.map((text) => (
                  <p key={text} className="text-sm leading-relaxed text-foreground/90">
                    {text}
                  </p>
                ))}
              </section>
            ))}
            <nav aria-label="Outros documentos" className="flex flex-wrap gap-4 text-sm pt-4 border-t border-border">
              {(Object.keys(LEGAL_DOCS) as LegalSlug[])
                .filter((other) => other !== slug)
                .map((other) => (
                  <Link key={other} to={`/${other}`} className="underline">
                    {LEGAL_DOCS[other].title}
                  </Link>
                ))}
            </nav>
          </>
        )}
      </article>
    </PublicShell>
  );
}
