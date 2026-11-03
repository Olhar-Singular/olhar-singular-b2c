#!/usr/bin/env python3
"""
build-classic-fonts.py — gera os arquivos `.ttf` das famílias CLÁSSICAS que o
PDF do Adaptar embute (achado 0445).

Por quê: `sans`/`arial`/`serif`/`georgia` mapeavam para os built-ins Type 1 do
`@react-pdf` (Helvetica, Times-Roman). Built-in, por definição do formato PDF,
NÃO é embutido: `pdffonts` mostra `emb: no` e o leitor da outra máquina troca a
fonte por qualquer substituta. Métrica diferente = quebra de linha diferente =
paginação diferente da que a prévia prometeu — num arquivo que existe para ser
impresso na escola, em máquina que não é a do professor.

A fonte escolhida é a **Liberation** (SIL OFL 1.1, redistribuível): Liberation
Sans é metricamente compatível com Arial/Helvetica e Liberation Serif com Times
New Roman/Times-Roman, então embutir não muda a paginação de nenhum documento
já salvo — só passa a garanti-la fora daqui.

O que o script faz com cada arquivo de origem:

  1. Subset para o repertório que uma atividade em pt-BR imprime (latim +
     pontuação + setas/formas geométricas + grego, usado no alt de fórmula).
     Os arquivos originais têm ~400 KB cada por carregarem cirílico, hebraico e
     mais; o subset derruba isso para uma fração, e o `@react-pdf`/fontkit
     subsetaria de novo na exportação de qualquer forma.
  2. Remove a feature `liga`, pela mesma razão de `strip-font-ligatures.py`:
     ligaduras estão ligadas por padrão na tela e no fontkit, e nada na app
     consegue desligá-las no PDF, então a paridade só se mantém sem a feature.

Uso (fonttools não é dependência do projeto — venv descartável):

    python3 -m venv /tmp/fontvenv && /tmp/fontvenv/bin/pip install fonttools
    /tmp/fontvenv/bin/python scripts/build-classic-fonts.py

Origem: pacote Debian `fonts-liberation` 2.1.5 (/usr/share/fonts/truetype/liberation).
O resultado é travado por `src/components/adaptation/render/pdf/fontAssets.test.ts`
(TrueType real, cobertura pt-BR, sem `liga`) e por `fontsEmbedded.test.ts`.
"""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

SOURCE_DIR = Path("/usr/share/fonts/truetype/liberation")
FONTS_DIR = Path(__file__).resolve().parent.parent / "public" / "fonts"

FACES = ["Regular", "Bold", "Italic", "BoldItalic"]
FAMILIES = ["LiberationSans", "LiberationSerif"]

# Repertório mantido: ASCII + Latin-1 + Latin Extended-A/B, espaçamentos
# modificadores, grego (alt de fórmula), pontuação geral, moedas, símbolos
# matemáticos, setas e formas geométricas (a caixa do checkbox).
UNICODE_RANGES = [
    (0x0020, 0x024F),
    (0x02B0, 0x02FF),
    (0x0370, 0x03FF),
    (0x2000, 0x2BFF),
]


def feature_tags(font: TTFont) -> set[str]:
    tags: set[str] = set()
    for table_tag in ("GSUB", "GPOS"):
        if table_tag in font:
            feature_list = font[table_tag].table.FeatureList
            if feature_list is not None:
                tags.update(r.FeatureTag for r in feature_list.FeatureRecord)
    return tags


def build(src: Path, dest: Path) -> None:
    font = TTFont(src)
    options = subset.Options()
    options.layout_features = sorted(feature_tags(font) - {"liga"})
    options.glyph_names = True
    options.notdef_outline = True
    options.recalc_bounds = False
    options.recalc_timestamp = False
    options.hinting = True
    options.legacy_kern = True
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    options.drop_tables = ["DSIG"]

    unicodes = [cp for lo, hi in UNICODE_RANGES for cp in range(lo, hi + 1)]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    font.save(dest)
    font.close()


def main() -> None:
    for family in FAMILIES:
        for face in FACES:
            src = SOURCE_DIR / f"{family}-{face}.ttf"
            dest = FONTS_DIR / f"{family}-{face}.ttf"
            build(src, dest)
            print(f"{dest.name}: {dest.stat().st_size // 1024} KB (de {src})")


if __name__ == "__main__":
    main()
