#!/usr/bin/env python3
"""
build-symbol-fonts.py — gera os arquivos `.ttf` da fonte de SÍMBOLOS do PDF do
Adaptar (achado C-01, lote 4 da frente matemática).

Por quê: nenhuma família que a professora escolhe no Formato cobre o repertório
da matemática escolar. Medido sobre os 124 símbolos exigidos (`src/test/mathSymbols.json`):
Liberation Sans/Serif não têm 24 (∈ ∉ ⊂ ∪ ∅ ∀ ∃ ⇒ ℕ ℤ ℚ ℝ ℂ ∛ △ ⊥ ...), OpenDyslexic 22,
Lexend 110, Atkinson 111 (nem o grego), e a Courier built-in só tem a CP1252.
Sem glifo, o `@react-pdf` cai na Helvetica Type 1 que ele sempre anexa ao fim da
pilha, e o byte WinAnsi vira OUTRO caractere (`≤` → `d`, `√` → nada).

A solução é um FALLBACK POR GLIFO: o `fontFamily` do PDF passa a ser uma pilha
(`["Atkinson Hyperlegible", "DejaVu Sans"]`) e o textkit escolhe, caractere a
caractere, a primeira fonte que tem o glifo. A família escolhida continua
desenhando tudo o que ela sabe desenhar; a de símbolos só entra onde falta.

Fonte: DejaVu Sans (cobre os 124 símbolos) e DejaVu Sans Mono (cobre 123; falta ∥,
que cai na DejaVu Sans). A monoespaçada existe para a fórmula (Courier): o avanço
dela é 0,602 em, quase o da Courier (0,600), então a conta de colunas da conta
armada (`mathAtom`) não muda. Licença: Bitstream Vera + domínio público (livre
para embutir, redistribuir e modificar, desde que a fonte modificada não se chame
"Bitstream" nem "Vera"; o nome continua DejaVu). Texto em `LICENSE-DejaVu.txt`.

O que o script faz com cada arquivo de origem:
  1. Subset para os blocos de símbolos (Latin-1, grego, pontuação geral, sobre e
     subscritos, letras e números, setas, operadores matemáticos, formas
     geométricas): `UNICODE_RANGES`, que `pdfSymbolRepertoire.ts` espelha e
     `fontAssets.test.ts` confere contra o cmap real.
  2. Sem hinting nem tabelas de layout (GSUB/GPOS): o fontkit só consulta o cmap
     e os avanços, e isso derruba o peso.
  3. Glifos compostos viram contornos simples (`decompose_composites`): o cache de
     glifos do fontkit deixaria o símbolo sem entrada no ToUnicode do PDF.

Uso (fonttools não é dependência do projeto — venv descartável):

    python3 -m venv /tmp/fontvenv && /tmp/fontvenv/bin/pip install fonttools
    /tmp/fontvenv/bin/python scripts/build-symbol-fonts.py

Origem: pacote Debian `fonts-dejavu-core` 2.37 (/usr/share/fonts/truetype/dejavu).
"""

from pathlib import Path

from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

SOURCE_DIR = Path("/usr/share/fonts/truetype/dejavu")
FONTS_DIR = Path(__file__).resolve().parent.parent / "public" / "fonts"

# (origem, destino)
FILES = [
    ("DejaVuSans.ttf", "DejaVuSans-Symbols.ttf"),
    ("DejaVuSansMono.ttf", "DejaVuSansMono-Symbols.ttf"),
]

# Mantenha em lock-step com `src/components/adaptation/render/pdf/pdfSymbolRepertoire.ts`.
UNICODE_RANGES = [
    (0x00A0, 0x00FF),  # Latin-1: ² ³ ¹ ½ ¼ ¾ × ÷ · ° ± µ
    (0x0100, 0x024F),  # Latin Estendido A e B (ł ő ű ...: o que a Liberation tem e a Atkinson não)
    (0x02B0, 0x02FF),  # espaçamentos modificadores (ˆ ˜)
    (0x0370, 0x03FF),  # grego e copta (α-ω, Α-Ω, ϑ ϕ ϖ ϵ)
    (0x2000, 0x200A),  # espaços de largura fixa (fino, en, em ...)
    (0x2010, 0x2027),  # hífens, travessões, aspas, reticências
    (0x2030, 0x205E),  # ‰ ′ ″ ‴ ‹ › ⁄ (sinais gerais)
    (0x2070, 0x209F),  # sobrescritos e subscritos (⁰-⁹ ⁿ ₀-₉ ₙ)
    (0x20A0, 0x20CF),  # moedas (€ ₹ ...)
    (0x2100, 0x214F),  # letras (ℕ ℤ ℚ ℝ ℂ ℓ ℏ)
    (0x2150, 0x218F),  # frações e algarismos romanos (⅓ ⅔ ...)
    (0x2190, 0x21FF),  # setas
    (0x2200, 0x22FF),  # operadores matemáticos
    (0x2308, 0x230B),  # ⌈ ⌉ ⌊ ⌋
    (0x2300, 0x2300),  # ⌀ (diâmetro)
    (0x25A0, 0x25FF),  # formas geométricas (△ □)
    (0x2605, 0x2606),  # ★ ☆
    (0x2610, 0x2612),  # ☐ ☑ ☒ (caixas de marcar coladas de editor de prova)
    (0x2660, 0x2667),  # ♠ ♡ ♢ ♣ ♤ ♥ ♦ ♧ (naipes: probabilidade)
    (0x2713, 0x2718),  # ✓ ✔ ✕ ✖ ✗ ✘ (certo e errado)
    (0x27F0, 0x27FF),  # setas longas (⟵ ⟶ ⟷ ⟸ ⟹ ⟺ ⟼ ...)
    (0x2A2F, 0x2A2F),  # ⨯ (produto vetorial)
    (0x2A7D, 0x2A7E),  # ⩽ ⩾ (menor ou igual / maior ou igual inclinados)
    (0x27E6, 0x27EF),  # colchetes angulares (⟨ ⟩)
]


# A monoespaçada só serve a fórmula (Courier): letra latina estendida cai na proporcional.
MONO_SKIP = {(0x0100, 0x024F), (0x02B0, 0x02FF)}


def decompose_composites(font: TTFont) -> int:
    """
    Troca todo glifo COMPOSTO por contornos simples (devolve quantos).

    Por quê: o fontkit guarda o primeiro objeto de glifo criado para cada id, com
    os `codePoints` da primeira chamada. Quando um glifo é buscado como
    COMPONENTE de outro (o `√` dentro do `∛`, o `ⁿ` dentro do `ₙ`), ele nasce
    sem code point e fica assim no cache: depois, o `√` pintado sozinho sai certo
    no papel mas sem entrada no ToUnicode do PDF, e `pdftotext`, o copiar-colar e
    o leitor de tela perdem o símbolo ("cos = 3/2"). Sem composto, não há glifo
    nascido como componente.
    """
    glyf = font["glyf"]
    glyph_set = font.getGlyphSet()
    count = 0
    for name in font.getGlyphOrder():
        if not glyf[name].isComposite():
            continue
        recording = DecomposingRecordingPen(glyph_set)
        glyph_set[name].draw(recording)
        pen = TTGlyphPen(None)
        recording.replay(pen)
        glyf[name] = pen.glyph()
        count += 1
    return count


def build(src: Path, dest: Path, ranges: list[tuple[int, int]]) -> None:
    font = TTFont(src)
    decompose_composites(font)
    options = subset.Options()
    options.layout_features = []
    options.glyph_names = False
    options.notdef_outline = True
    options.recalc_bounds = False
    options.recalc_timestamp = False
    options.hinting = False
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    options.drop_tables += ["DSIG", "GSUB", "GPOS", "GDEF", "kern"]

    unicodes = [cp for lo, hi in ranges for cp in range(lo, hi + 1)]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    font.save(dest)
    font.close()


REPERTOIRE_TS = (
    Path(__file__).resolve().parent.parent
    / "src/components/adaptation/render/pdf/pdfSymbolRepertoire.ts"
)


def collapse(codepoints: list[int]) -> list[tuple[int, int]]:
    """Run-length: [1,2,3,7,8] -> [(1,3),(7,8)]."""
    ranges: list[tuple[int, int]] = []
    for cp in sorted(codepoints):
        if ranges and cp == ranges[-1][1] + 1:
            ranges[-1] = (ranges[-1][0], cp)
        else:
            ranges.append((cp, cp))
    return ranges


def write_repertoire(font_path: Path) -> None:
    """Escreve o que a fonte de símbolos TEM, exato, para o aviso do Exportar."""
    font = TTFont(font_path)
    codepoints = [cp for cp in font.getBestCmap() if cp > 0x20 or cp == 0x20]
    font.close()
    rows = "\n".join(f"  [0x{lo:04X}, 0x{hi:04X}]," for lo, hi in collapse(codepoints))
    REPERTOIRE_TS.write_text(
        "// GERADO por scripts/build-symbol-fonts.py: não editar à mão.\n"
        "// Faixas de code points que `public/fonts/DejaVuSans-Symbols.ttf` desenha (o cmap\n"
        "// exato). Conferido contra o arquivo por `pdfSymbolRepertoire.test.ts`.\n"
        "export const PDF_SYMBOL_RANGES: ReadonlyArray<readonly [number, number]> = [\n"
        f"{rows}\n"
        "];\n",
        encoding="utf-8",
    )


def main() -> None:
    for source, target in FILES:
        src = SOURCE_DIR / source
        dest = FONTS_DIR / target
        ranges = [r for r in UNICODE_RANGES if "Mono" not in source or r not in MONO_SKIP]
        build(src, dest, ranges)
        print(f"{dest.name}: {dest.stat().st_size / 1024:.0f} KB (de {src})")
    write_repertoire(FONTS_DIR / FILES[0][1])
    print(f"{REPERTOIRE_TS.name}: ok")


if __name__ == "__main__":
    main()
