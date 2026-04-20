export type BarrierDimension = {
  key: string;
  label: string;
  barriers: { key: string; label: string }[];
};

export const BARRIER_DIMENSIONS: BarrierDimension[] = [
  {
    key: "tea",
    label: "TEA (Transtorno do Espectro Autista)",
    barriers: [
      { key: "tea_abstracao", label: "Dificuldade com abstração excessiva" },
      { key: "tea_comunicacao_social", label: "Dificuldade na comunicação social" },
      { key: "tea_sobrecarga_sensorial", label: "Sobrecarga sensorial" },
      { key: "tea_mudancas_inesperadas", label: "Dificuldade com mudanças inesperadas" },
    ],
  },
  {
    key: "tdah",
    label: "TDAH",
    barriers: [
      { key: "tdah_atencao_sustentada", label: "Dificuldade de atenção sustentada" },
      { key: "tdah_impulsividade", label: "Impulsividade" },
      { key: "tdah_organizacao", label: "Dificuldade de organização" },
    ],
  },
  {
    key: "tod",
    label: "TOD (Transtorno Opositivo-Desafiador)",
    barriers: [
      { key: "tod_resistencia_regras", label: "Resistência a regras" },
      { key: "tod_conflitos_autoridade", label: "Conflitos com autoridade" },
    ],
  },
  {
    key: "sindrome_down",
    label: "Síndrome de Down",
    barriers: [
      { key: "down_ritmo_lento", label: "Ritmo de aprendizagem mais lento" },
      { key: "down_memoria_curto_prazo", label: "Dificuldades na memória de curto prazo" },
      { key: "down_abstracao", label: "Dificuldade com abstração" },
    ],
  },
  {
    key: "altas_habilidades",
    label: "Altas Habilidades / Superdotação",
    barriers: [
      { key: "ah_desmotivacao", label: "Desmotivação por falta de desafio" },
      { key: "ah_tedio", label: "Tédio em atividades de baixa complexidade" },
    ],
  },
  {
    key: "dislexia",
    label: "Dislexia",
    barriers: [
      { key: "dislexia_leitura", label: "Dificuldade na leitura e interpretação de enunciados" },
      { key: "dislexia_decodificacao", label: "Dificuldade na decodificação de palavras" },
    ],
  },
  {
    key: "discalculia",
    label: "Discalculia",
    barriers: [
      { key: "discalculia_conceitos", label: "Dificuldade na compreensão de conceitos numéricos" },
      { key: "discalculia_operacoes", label: "Dificuldade com operações matemáticas" },
    ],
  },
  {
    key: "disgrafia",
    label: "Disgrafia",
    barriers: [
      { key: "disgrafia_escrita", label: "Dificuldade na escrita manual" },
      { key: "disgrafia_organizacao_espacial", label: "Dificuldade na organização espacial" },
    ],
  },
  {
    key: "tourette",
    label: "Síndrome de Tourette",
    barriers: [
      { key: "tourette_tiques", label: "Tiques motores ou vocais involuntários" },
      { key: "tourette_atencao", label: "Dificuldade de atenção por conta dos tiques" },
    ],
  },
  {
    key: "dispraxia",
    label: "Dispraxia",
    barriers: [
      { key: "dispraxia_coordenacao", label: "Dificuldade de coordenação motora" },
      { key: "dispraxia_planejamento_motor", label: "Dificuldade no planejamento motor" },
    ],
  },
  {
    key: "toc",
    label: "TOC (Transtorno Obsessivo-Compulsivo)",
    barriers: [
      { key: "toc_rituais", label: "Rituais compulsivos que interferem na tarefa" },
      { key: "toc_perfeccionismo", label: "Perfeccionismo excessivo" },
    ],
  },
];
