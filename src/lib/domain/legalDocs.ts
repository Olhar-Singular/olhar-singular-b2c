// Legal texts shown at /termos, /privacidade and /reembolso. Drafts until the
// legal review lands. The version shown is the one the checkout records on
// profiles.terms_version, so both move together.
//
// Every clause here mirrors a real behaviour of the product (checkout, trial,
// credits, refund flow, analytics consent, AI provider, admin access). Nothing
// below promises a feature the product does not have. When a behaviour
// changes, change the clause in the same task and bump TERMS_VERSION.

import { SUPPORT_EMAIL } from "@/lib/constants";
import {
  EXTRAS_REFUND_DAYS,
  REFUND_WINDOW_DAYS,
  TERMS_VERSION,
  TRIAL_CREDITS,
  TRIAL_DAYS,
} from "@/lib/domain/subscriptionUi";

export type LegalSlug = "termos" | "privacidade" | "reembolso";

interface Section {
  title: string;
  paragraphs: string[];
}

export interface LegalDoc {
  title: string;
  intro: string;
  /** Human-readable date printed under the title ("Última atualização"). */
  updatedAt: string;
  sections: Section[];
}

// Company facts (Receita Federal, 2026-10-13) and the data-protection officer
// named by the owner the same day. The owner also decided (2026-10-13) that the
// officer's e-mail is published on the public legal pages, as LGPD art. 41 §1
// and Decreto 7.962 art. 2 require; the refund policy keeps pointing to the
// account menu.
export const LEGAL_ENTITY = {
  brand: "Olhar Singular",
  legalName: "Olhar Singular Ltda. ME",
  cnpj: "66.792.955/0001-37",
  address: "Rua Angelo Belloni, 317, Parque dos Bandeirantes, Ribeirão Preto/SP, CEP 14090-400",
  city: "Ribeirão Preto/SP",
  dpo: "Alexandre Souza de Macedo",
  email: SUPPORT_EMAIL,
  site: "professor.olharsingular.com",
} as const;

export const LEGAL_UPDATED_AT = "14 de outubro de 2026";

// Minimum notice for changes that touch price, credits, refund rules, rights or
// obligations. One number, quoted by every clause that promises a notice.
export const LEGAL_NOTICE_DAYS = 30;

// Working days the team commits to for support, contestations and removals.
export const SUPPORT_REPLY_BUSINESS_DAYS = 5;

const FIRST_CHARGE_DAY = TRIAL_DAYS + 1;

const QUALIFICATION =
  `${LEGAL_ENTITY.legalName}, pessoa jurídica de direito privado inscrita no CNPJ sob o nº ${LEGAL_ENTITY.cnpj}, ` +
  `com sede em ${LEGAL_ENTITY.address}, endereço eletrônico ${LEGAL_ENTITY.email}, ` +
  `titular da marca e da plataforma ${LEGAL_ENTITY.brand}, disponível em ${LEGAL_ENTITY.site}`;

const SUPPORT_CHANNEL =
  "pelo canal de Suporte, disponível no menu da sua conta na plataforma, que exibe o endereço de contato";

// One list, quoted by the Terms and by the Privacy Policy, so the two never
// diverge on what must not be typed about a student.
const STUDENT_DATA_BAN =
  "nome ou sobrenome, data de nascimento ou idade exata, turma ou escola que permita identificação, CPF ou outro documento, fotografias, diagnósticos, laudos, códigos de doença, medicação, histórico de saúde ou qualquer outra informação que permita identificar o aluno ou terceiro";

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = {
  termos: {
    title: "Termos de Uso",
    updatedAt: LEGAL_UPDATED_AT,
    intro:
      "Estes Termos de Uso regulam o acesso e a utilização da plataforma Olhar Singular, ferramenta pedagógica de apoio à adaptação de atividades escolares com inteligência artificial. Leia com atenção: ao criar uma conta, assinar um plano, iniciar o teste grátis ou utilizar a plataforma, você declara que leu, compreendeu e concorda com estes Termos, com a Política de Privacidade e com a Política de Reembolso.",
    sections: [
      {
        title: "1. Identificação e definições",
        paragraphs: [
          `1.1. A plataforma é operada por ${QUALIFICATION} ("Olhar Singular", "nós").`,
          '1.2. Para os fins destes Termos: "Plataforma" é o conjunto de páginas, funcionalidades, serviços e a assistente ISA disponibilizados pelo Olhar Singular; "Usuário" ou "você" é a pessoa natural que cria uma conta e utiliza a Plataforma; "Conta" é o cadastro individual de acesso, considerado existente até a sua exclusão; "Créditos" são a unidade de consumo das funcionalidades que utilizam inteligência artificial; "Créditos do Plano" são os créditos liberados a cada período da assinatura; "Créditos Extras" são os créditos comprados avulsos; "Conteúdo do Usuário" é todo material inserido por você (atividades, provas, arquivos, observações, perfis de barreira, questões e mensagens); "Conteúdo Gerado" é o resultado produzido pela inteligência artificial a partir do Conteúdo do Usuário; "ISA" é a assistente pedagógica conversacional da Plataforma; "Teste Grátis" é o período de avaliação descrito na cláusula 6.',
          "1.3. Estes Termos, a Política de Privacidade e a Política de Reembolso formam um único instrumento contratual, apresentado integralmente antes da contratação e aceito em conjunto no checkout. Em caso de conflito entre eles, prevalece a regra mais específica sobre o tema e, em qualquer caso, a interpretação mais favorável a você.",
        ],
      },
      {
        title: "2. Aceitação e capacidade",
        paragraphs: [
          "2.1. A Plataforma destina-se a pessoas naturais maiores de 18 anos e plenamente capazes, em especial educadores, pedagogos, terapeutas e demais profissionais da educação. Menores de 18 anos não podem criar conta nem utilizar a Plataforma.",
          "2.2. O aceite destes Termos é registrado no checkout de criação da Conta (assinatura ou Teste Grátis) por meio da caixa de seleção \"Li e aceito\", que apresenta os links para o texto integral dos três documentos. Ficam gravados em nossos sistemas a versão aceita e a data e hora do aceite. Quem já tem Conta e contrata um plano depois não repete o aceite: permanece vinculado à versão aceita na criação da Conta ou, nas contas criadas por convite, à versão vigente no primeiro acesso, e às alterações comunicadas na forma da cláusula 17. Para contas criadas por convite da equipe, o aceite é manifestado no primeiro acesso à Plataforma, e a versão vigente pode ser consultada a qualquer momento nesta página.",
          "2.3. Se você não concordar com qualquer condição destes Termos, não utilize a Plataforma.",
          "2.4. Ao aceitar, você declara que as informações fornecidas são verdadeiras e atuais, que usará a Plataforma apenas para fins lícitos e compatíveis com estes Termos e que é o titular do cartão informado ou está autorizado pelo titular a utilizá-lo. Se o cartão for de outra pessoa, você declara ter dado a ela ciência da Política de Privacidade quanto ao tratamento do CPF e dos dados do pagamento.",
          `2.5. Enviamos ao e-mail da Conta (ou, se ele não puder ser lido, ao e-mail informado no pagamento) um e-mail de confirmação da contratação, que é o seu comprovante, nos seguintes momentos: quando o pagamento é aprovado na hora no checkout ou o Teste Grátis é iniciado; quando a operadora deixa o cartão em análise no checkout e a aprovação chega depois; e quando uma assinatura encerrada é reativada por uma nova cobrança aprovada. Não há novo e-mail de confirmação nas renovações mensais nem na primeira cobrança do Teste Grátis, já anunciada na confirmação inicial e no lembrete da cláusula 6.2. O e-mail informa: o plano; o valor; os créditos por mês; a data da primeira cobrança (no Teste Grátis) ou a indicação de que a cobrança foi feita no dia; a regra das cobranças seguintes (todo mês, na mesma data); a versão destes Termos aceita, quando disponível no momento do envio; e os links para estes Termos, para a Política de Privacidade, para a Política de Reembolso e para a área Créditos, onde o cancelamento é feito. Guarde este e-mail. Contas novas recebem também, no e-mail cadastrado, o link de acesso para definir a senha, mesmo com o cartão em análise; nesse caso, os créditos são liberados quando a aprovação chegar e, se o link não chegar, um novo pode ser pedido pela opção "Esqueci minha senha" na tela de acesso. Estes Termos, a Política de Privacidade e a Política de Reembolso permanecem disponíveis em ${LEGAL_ENTITY.site}, com a versão e a data de atualização, e podem ser salvos ou impressos a qualquer momento.`,
        ],
      },
      {
        title: "3. O serviço",
        paragraphs: [
          "3.1. O Olhar Singular oferece ferramentas para adaptar provas, exercícios e atividades pedagógicas a alunos com barreiras de aprendizagem observáveis em sala de aula, gerar justificativas pedagógicas das adaptações, extrair questões de arquivos PDF e DOCX, organizar um banco de questões, manter perfis de barreiras e conversar com a ISA sobre práticas pedagógicas.",
          "3.2. Natureza pedagógica. A Plataforma é um instrumento de apoio ao trabalho docente. Ela não realiza diagnóstico, avaliação clínica, laudo ou indicação terapêutica e não substitui o professor, a equipe pedagógica, os profissionais de saúde nem os documentos exigidos pela legislação educacional. A decisão de usar, alterar, complementar ou descartar qualquer material é exclusivamente sua.",
          "3.3. Inteligência artificial. O Conteúdo Gerado é produzido por modelos de inteligência artificial de terceiros e pode conter erros, imprecisões, omissões, vieses ou trechos inadequados ao contexto. Você se obriga a revisar integralmente todo material antes de utilizá-lo com alunos, famílias ou instituições. O Olhar Singular não garante a exatidão, a adequação pedagógica, a originalidade ou a conformidade do Conteúdo Gerado com diretrizes curriculares ou normas de qualquer instituição.",
          "3.4. Sem garantia de resultado. Não garantimos resultados de aprendizagem, aprovação em avaliações, aceitação do material por coordenações, escolas ou órgãos públicos, nem qualquer outro resultado específico.",
          `3.5. Evolução do serviço. Podemos acrescentar, substituir ou aprimorar funcionalidades, modelos de inteligência artificial e limites técnicos (como tamanho máximo de atividade e formatos de arquivo aceitos), preservando as funcionalidades essenciais do plano contratado durante o período pago. O custo em créditos de cada operação, exibido na Plataforma antes de cada uso, vale por todo o período já pago; alterações desse custo só se aplicam a partir da renovação seguinte e são comunicadas com antecedência mínima de ${LEGAL_NOTICE_DAYS} dias, na forma da cláusula 5.8.`,
          "3.6. Disponibilidade. Empregamos esforços comercialmente razoáveis para manter a Plataforma disponível de forma contínua, sem prejuízo de interrupções para manutenção, atualizações, falhas de fornecedores (nuvem, inteligência artificial, pagamento, conectividade), caso fortuito ou força maior. Interrupções programadas são avisadas na Plataforma com antecedência, e, em caso de indisponibilidade relevante, respondemos na forma da cláusula 13.",
          `3.7. Acessibilidade. A Plataforma é desenvolvida buscando seguir as diretrizes de acessibilidade para conteúdo web (WCAG 2.1, nível AA). Barreiras de acessibilidade no uso da Plataforma podem ser reportadas ${SUPPORT_CHANNEL}, e são tratadas com prioridade.`,
        ],
      },
      {
        title: "4. Conta e acesso",
        paragraphs: [
          "4.1. A Conta pode ser criada de três formas: pela assinatura de um plano pago, pelo Teste Grátis com cartão de crédito ou por convite da equipe do Olhar Singular. Não há cadastro público gratuito.",
          "4.2. O acesso é feito com e-mail e senha. Contas criadas a partir de um pagamento recebem um link de acesso no e-mail informado no checkout e devem definir a própria senha no primeiro acesso. Você é o único responsável pela exatidão do e-mail informado: um e-mail incorreto pode impedir o acesso à sua própria Conta, e o e-mail é confirmado duas vezes no checkout justamente para evitar isso.",
          "4.3. A Conta é pessoal, individual e intransferível. É vedado compartilhar credenciais, ceder, vender, alugar ou permitir o uso da Conta por terceiros, inclusive entre colegas da mesma instituição. Você responde pelas atividades realizadas com a sua Conta, inclusive pelo consumo de créditos, salvo quando decorrerem de falha de segurança atribuível ao Olhar Singular.",
          `4.4. Mantenha sua senha em sigilo e comunique imediatamente, ${SUPPORT_CHANNEL}, qualquer uso não autorizado ou suspeita de incidente de segurança, para que possamos bloquear o acesso indevido.`,
          "4.5. Podemos solicitar a confirmação de identidade ou da titularidade do e-mail ou do cartão para proteger a Conta, atender a um pedido seu ou apurar suspeita de fraude.",
          "4.6. Os dados cadastrais devem ser mantidos atualizados. A alteração do e-mail de acesso é feita pelo Suporte, mediante verificação.",
        ],
      },
      {
        title: "5. Planos, créditos e pagamento",
        paragraphs: [
          "5.1. Os planos são mensais e dão direito a uma cota de Créditos do Plano. Os preços e as cotas vigentes são exibidos, em reais e com os tributos incluídos, na página de planos e no checkout, sem nenhuma taxa adicional. O valor e a cota apresentados no momento da contratação prevalecem para o período contratado.",
          "5.2. O pagamento da assinatura é feito por cartão de crédito, em parcela única, com cobrança recorrente automática na mesma data de cada mês, processada pelo Mercado Pago. A cobrança aparece na fatura do cartão como OLHAR SINGULAR. Os dados completos do cartão são informados diretamente ao Mercado Pago e não transitam nem são armazenados pelo Olhar Singular.",
          "5.3. Renovação. A cada cobrança confirmada, o saldo de Créditos do Plano é substituído pela cota do novo mês. Créditos do Plano não utilizados não acumulam, não são transferidos para o período seguinte e não geram restituição, informação que é apresentada antes da contratação.",
          "5.4. Créditos Extras podem ser comprados avulsos, por Pix ou cartão de crédito, são liberados após a confirmação do pagamento e não expiram enquanto a Conta existir, com ou sem assinatura ativa. Eles são consumidos somente depois de esgotados os Créditos do Plano.",
          "5.5. O custo em créditos de cada operação (por exemplo, uma adaptação, a leitura de uma prova enviada ou uma nova conversa com a ISA) é informado na Plataforma antes de cada uso. Nas adaptações e na leitura de arquivos, os créditos são reservados no início da operação e devolvidos automaticamente se ela não for concluída, por qualquer motivo que não seja atribuível a você. Na ISA, o custo de uma conversa nova é debitado no momento em que ela é criada, sem reserva nem devolução automática: as mensagens trocadas dentro dela não têm custo adicional, até o limite de mensagens por conversa e de conversas guardadas indicado na Plataforma; atingido o limite, iniciar outra conversa tem o custo informado antes de ela ser criada. Se uma mensagem falhar por erro nosso, a conversa volta ao estado anterior e você pode enviá-la de novo sem novo custo. Não há devolução de créditos por insatisfação com o Conteúdo Gerado, cabendo a você revisá-lo, editá-lo ou gerar uma nova versão.",
          "5.6. Os créditos representam uma licença de uso das funcionalidades da Plataforma. Eles não têm valor monetário, não são moeda nem título de crédito, e não podem ser transferidos, vendidos, trocados ou convertidos em dinheiro, exceto nas hipóteses de reembolso previstas na Política de Reembolso e nestes Termos.",
          "5.7. Falha de cobrança. Se a cobrança da renovação for recusada, o Mercado Pago poderá realizar novas tentativas nos dias seguintes, conforme as regras da operadora. Enquanto a cobrança não for confirmada, não há liberação de nova cota de Créditos do Plano; quando aprovada em data diversa, o novo período de 30 dias conta da data da cobrança aprovada. Persistindo a recusa, a assinatura é cancelada e o acesso aos Créditos do Plano cessa, permanecendo os Créditos Extras. Você pode atualizar o cartão a qualquer momento na área Créditos.",
          `5.8. Alteração de preços. Qualquer reajuste de preço, de cota ou do custo em créditos será comunicado com, no mínimo, ${LEGAL_NOTICE_DAYS} dias de antecedência, por e-mail e por aviso na Plataforma, e passará a valer apenas a partir da renovação seguinte ao fim desse prazo. Não concordando, basta cancelar a assinatura antes da renovação, sem qualquer ônus.`,
          "5.9. Troca de plano. Para mudar de plano, cancele o plano atual e assine o novo. Os Créditos do Plano novo substituem os do plano antigo.",
          "5.10. Promoções, cupons, créditos de cortesia, prorrogações e contas concedidas por convite podem ter regras próprias e ser encerrados para novas adesões a qualquer momento, respeitadas integralmente as condições já concedidas a quem aderiu durante a vigência.",
          "5.11. Emitiremos o documento fiscal correspondente às cobranças nos termos da legislação aplicável.",
        ],
      },
      {
        title: "6. Teste grátis",
        paragraphs: [
          `6.1. O Teste Grátis tem duração de ${TRIAL_DAYS} dias, libera ${TRIAL_CREDITS} créditos e exige um cartão de crédito válido, verificado no momento do cadastro. A verificação pode gerar uma pré-autorização ou uma cobrança simbólica, estornada automaticamente pela operadora do cartão. Durante o Teste Grátis nada é cobrado.`,
          `6.2. No ${FIRST_CHARGE_DAY}º dia (${TRIAL_DAYS} dias após o início do teste), salvo cancelamento anterior, o cartão informado é cobrado pelo plano e pelo valor exibidos no checkout e no e-mail de confirmação da contratação, que prevalecem para o primeiro período. A partir daí a Conta passa a ser uma assinatura comum, com renovação automática mensal nos termos da cláusula 5. A data e o valor dessa primeira cobrança são informados antes de você digitar o cartão, repetidos na tela de confirmação e no e-mail de confirmação, e ficam visíveis na área Créditos durante todo o teste. Além disso, quando faltarem até 48 horas para a primeira cobrança, enviamos ao seu e-mail um lembrete com a data e o valor da cobrança, a data limite para cancelar (o dia anterior ao da cobrança) e o link para cancelar na área Créditos; se o envio falhar, ele é repetido a cada hora, para que o lembrete chegue, em regra, com pelo menos 24 horas de antecedência.`,
          "6.3. Você pode cancelar o Teste Grátis na área Créditos, com um clique. Cancelando até o dia anterior ao da primeira cobrança, nada é cobrado e o acesso aos créditos do teste é encerrado na hora. Como a cobrança pode ocorrer em qualquer horário do dia marcado, um cancelamento feito no próprio dia pode acontecer depois dela; nesse caso o valor é estornado integralmente na forma da Política de Reembolso.",
          "6.4. O Teste Grátis é limitado a um por CPF de titular de cartão e exige a criação de uma Conta nova. Quem já utilizou o Teste Grátis ou já teve uma assinatura só pode contratar um plano pago, o que é informado no próprio checkout. Tentativas de burlar essa regra (uso de vários CPFs, cartões ou contas) autorizam o cancelamento dos créditos do Teste Grátis obtidos indevidamente e o encerramento das contas criadas para esse fim.",
          "6.5. Podemos modificar, suspender ou encerrar a oferta do Teste Grátis a qualquer momento, sem afetar os testes já iniciados.",
          "6.6. A primeira cobrança do Teste Grátis pode ser estornada integralmente, em autoatendimento, nos termos da Política de Reembolso. Se, por falha nossa, o lembrete da cláusula 6.2 não for enviado, ou for enviado com menos de 24 horas de antecedência da cobrança, a primeira cobrança poderá, além disso, ser estornada integralmente a pedido, pelo Suporte, sem prejuízo do estorno em autoatendimento. Não se considera falha nossa a não entrega causada pelo seu provedor de e-mail ou por e-mail cadastrado incorreto. O prazo legal de arrependimento dessa cobrança conta-se da data em que ela é efetuada.",
        ],
      },
      {
        title: "7. Cancelamento e direito de arrependimento",
        paragraphs: [
          "7.1. Você pode cancelar a assinatura a qualquer momento, na área Créditos, sem multa, sem fidelidade e sem necessidade de contato com o Suporte. Após o cancelamento não há nova cobrança, o acesso aos Créditos do Plano continua até o fim do período já pago e os Créditos Extras permanecem na Conta.",
          "7.2. Como o serviço do período já pago continua disponível até o seu fim, não há reembolso proporcional pelos dias restantes do período em curso, exceto nas hipóteses da Política de Reembolso, que permite estornar integralmente a última cobrança.",
          "7.3. O direito de arrependimento previsto no art. 49 do Código de Defesa do Consumidor pode ser exercido em até 7 dias corridos a contar da contratação ou, no Teste Grátis, da primeira cobrança. Ele é atendido na forma da Política de Reembolso, que oferece, para a assinatura, condições mais amplas que o prazo legal.",
        ],
      },
      {
        title: "8. Conteúdo do Usuário e dados de alunos",
        paragraphs: [
          "8.1. Você permanece titular do Conteúdo do Usuário. Ao inseri-lo na Plataforma, você nos concede uma licença não exclusiva e gratuita, válida enquanto o conteúdo permanecer na sua Conta e limitada à finalidade de operar o serviço: armazenar, processar, transmitir aos provedores de inteligência artificial, exibir para você e produzir o Conteúdo Gerado. Não utilizamos o seu conteúdo para publicidade, não o publicamos e não o compartilhamos com outros usuários.",
          "8.2. Você declara deter os direitos necessários sobre o Conteúdo do Usuário (por exemplo, provas e materiais próprios, da sua instituição ou de uso autorizado) e responde por reclamações de terceiros relativas a ele, na medida da sua culpa.",
          `8.3. É proibido inserir na Plataforma dados pessoais de alunos ou de quaisquer terceiros, em especial: ${STUDENT_DATA_BAN}. A Plataforma foi desenhada para trabalhar com barreiras pedagógicas observáveis, e não com identidades: os perfis de barreira não possuem campo de identificação do aluno, e as descrições devem ser genéricas.`,
          "8.4. Se, apesar da vedação, você inserir dados pessoais de terceiros, você declara possuir base legal e as autorizações necessárias para tanto, inclusive dos responsáveis legais quando se tratar de criança ou adolescente, e responde pelas obrigações de controlador perante a Lei Geral de Proteção de Dados, as instituições e as famílias envolvidas. O Olhar Singular trata esses dados apenas para produzir o resultado solicitado por você, na condição de operador, e responde na medida da sua participação, nos termos do art. 42 da LGPD. Você se obriga a remover tais dados assim que os identificar.",
          `8.5. Medidas de proteção. Os perfis de barreira não têm campos de identificação; a Plataforma e esta página orientam o uso de descrições genéricas; e dados de terceiros apontados por você, por responsáveis legais ou por instituições são localizados e eliminados em até ${SUPPORT_REPLY_BUSINESS_DAYS} dias úteis após o pedido.`,
          `8.6. Denúncias e retirada de conteúdo. Qualquer pessoa pode denunciar conteúdo que viole direitos autorais, direitos de personalidade ou que identifique criança ou adolescente, pelos canais de contato do Olhar Singular, informando a descrição do material, o identificador ou localização, a fundamentação e os dados de contato do denunciante. Analisaremos a denúncia em até ${SUPPORT_REPLY_BUSINESS_DAYS} dias úteis, podendo tornar o conteúdo indisponível por cautela, e comunicaremos o Usuário responsável, que terá o mesmo prazo para se manifestar antes de uma decisão definitiva. Decisões podem ser revistas pelo Suporte. Conteúdo que exponha cenas de nudez ou atos sexuais de caráter privado é removido imediatamente mediante notificação do ofendido, nos termos do art. 21 do Marco Civil da Internet.`,
          "8.7. Não realizamos monitoramento prévio do Conteúdo do Usuário. Podemos, contudo, remover conteúdo e suspender ou encerrar Contas em caso de violação destes Termos, da lei ou de ordem de autoridade competente, observado o procedimento da cláusula 12.",
        ],
      },
      {
        title: "9. Conteúdo Gerado por inteligência artificial",
        paragraphs: [
          "9.1. Na extensão em que a legislação reconheça direitos sobre o Conteúdo Gerado, o Olhar Singular licencia a você, de forma gratuita, não exclusiva, perpétua e irrevogável, os direitos que eventualmente detenha sobre ele, para uso na sua atividade educacional e profissional, incluindo edição, impressão, exportação e distribuição a alunos, famílias e instituições de ensino. A licença não inclui a comercialização do Conteúdo Gerado como produto autônomo (por exemplo, apostilas ou bancos de questões vendidos a terceiros), que depende de autorização por escrito.",
          "9.2. Por ser produzido por modelos estatísticos, o Conteúdo Gerado pode ser idêntico ou semelhante ao produzido para outros usuários a partir de materiais parecidos. Não garantimos originalidade nem exclusividade.",
          "9.3. O Conteúdo Gerado não constitui parecer pedagógico, psicopedagógico, médico, psicológico, jurídico ou de qualquer outra natureza profissional. A responsabilidade pela sua aplicação, bem como pela observância das normas da sua instituição e da legislação educacional, é sua.",
          "9.4. É proibido apresentar o Conteúdo Gerado como laudo, diagnóstico, avaliação clínica ou documento oficial, ou utilizá-lo em finalidades que exijam avaliação por profissional regulamentado.",
        ],
      },
      {
        title: "10. Propriedade intelectual",
        paragraphs: [
          "10.1. A Plataforma, seu software, código-fonte, layout, interfaces, marcas (incluindo Olhar Singular e ISA), textos, ilustrações, prompts, metodologias, bases de dados e demais elementos são de titularidade do Olhar Singular ou de seus licenciantes e são protegidos pelas Leis nº 9.279/1996, 9.609/1998 e 9.610/1998.",
          "10.2. Concedemos a você uma licença pessoal, limitada, revogável, não exclusiva e intransferível para utilizar a Plataforma durante a vigência da sua Conta, exclusivamente nos termos deste instrumento.",
          "10.3. É vedado copiar, reproduzir, modificar, descompilar, realizar engenharia reversa, criar obras derivadas, extrair dados de forma automatizada, remover avisos de propriedade, explorar comercialmente a Plataforma ou utilizar suas marcas sem autorização prévia e por escrito. Fica sempre ressalvada a exportação do seu próprio conteúdo pelas ferramentas da Plataforma ou por pedido de portabilidade.",
          "10.4. Sugestões, críticas e ideias enviadas por você sobre a Plataforma podem ser utilizadas livremente pelo Olhar Singular, sem qualquer remuneração ou obrigação de confidencialidade.",
        ],
      },
      {
        title: "11. Uso aceitável",
        paragraphs: [
          "11.1. Ao utilizar a Plataforma, você se compromete a não: (a) violar a legislação ou direitos de terceiros, incluindo propriedade intelectual, imagem, honra e privacidade; (b) produzir ou disseminar conteúdo ilícito, discriminatório, de ódio, violento, que sexualize crianças ou adolescentes, ou que configure assédio; (c) inserir dados pessoais de terceiros sem base legal; (d) burlar, manipular ou explorar falhas no sistema de créditos, de cobrança, do Teste Grátis ou de reembolso; (e) utilizar cartões ou dados de pagamento de terceiros sem autorização ou praticar qualquer fraude; (f) acessar ou tentar acessar dados de outras contas, áreas restritas ou a infraestrutura da Plataforma; (g) utilizar robôs, scripts, raspagem de dados ou automação não autorizada; (h) interferir no funcionamento da Plataforma por sobrecarga, malware ou testes de intrusão não autorizados; (i) revender, sublicenciar, alugar ou disponibilizar a Plataforma ou os créditos a terceiros, inclusive por meio de conta compartilhada entre escolas, grupos ou colegas; (j) utilizar a Plataforma ou o Conteúdo Gerado para desenvolver produto concorrente ou treinar modelos de inteligência artificial; (k) usar identidade falsa ou se passar por outra pessoa.",
          "11.2. A Plataforma é oferecida a pessoas naturais, com uma Conta por educador. O uso institucional por escolas, redes de ensino ou empresas depende de contratação específica com o Olhar Singular.",
        ],
      },
      {
        title: "12. Suspensão e encerramento",
        paragraphs: [
          `12.1. Em caso de violação destes Termos ou de inadimplência, podemos suspender a sua Conta mediante aviso por e-mail com a indicação do motivo e prazo de ${SUPPORT_REPLY_BUSINESS_DAYS} dias para a sua manifestação. A suspensão imediata, sem aviso prévio, fica reservada a fraude comprovada, uso de meio de pagamento de terceiro sem autorização, determinação de autoridade competente ou risco atual à segurança da Plataforma, de outros usuários ou de terceiros; mesmo nesses casos, informaremos o motivo em até 2 dias úteis.`,
          "12.2. No encerramento por fraude comprovada, os créditos obtidos com a operação fraudulenta são cancelados. Nas demais hipóteses de suspensão ou encerramento por nossa iniciativa, os Créditos do Plano permanecem acessíveis até o fim do período já pago e os Créditos Extras não utilizados são restituídos pelo valor pago, salvo compensação com prejuízo comprovado causado por você.",
          `12.3. Você pode encerrar a sua Conta a qualquer momento: cancele a assinatura na área Créditos e solicite a exclusão ${SUPPORT_CHANNEL}. Antes de concluir a exclusão, informaremos o saldo de Créditos Extras, e você poderá consumi-los antes ou, se comprados nos últimos ${EXTRAS_REFUND_DAYS} dias, pedir o reembolso previsto na Política de Reembolso. Créditos não resgatados dessa forma são perdidos com a exclusão.`,
          `12.4. Se o Olhar Singular decidir descontinuar a Plataforma, comunicará os usuários com antecedência mínima de ${LEGAL_NOTICE_DAYS} dias e restituirá os valores pagos antecipadamente pelo período não usufruído e pelos Créditos Extras não utilizados.`,
          `12.5. Contestação. Em qualquer suspensão ou encerramento por nossa iniciativa, você pode apresentar contestação ${SUPPORT_CHANNEL} ou pelo e-mail de resposta do aviso recebido; a revisão é feita por uma pessoa da equipe, com resposta em até ${SUPPORT_REPLY_BUSINESS_DAYS} dias úteis. Salvo determinação de autoridade, o seu conteúdo fica disponível para cópia, mediante pedido ao Suporte, por 30 dias após o encerramento.`,
          "12.6. Sobrevivem ao encerramento as cláusulas que, por sua natureza, devam permanecer em vigor, como as relativas a propriedade intelectual, responsabilidade, lei aplicável e foro.",
        ],
      },
      {
        title: "13. Responsabilidade",
        paragraphs: [
          "13.1. O Olhar Singular responde pelos danos que causar a você na forma do Código de Defesa do Consumidor. Não responde quando provar que o defeito inexiste ou que o dano decorreu de culpa exclusiva sua ou de terceiro (art. 14, § 3º, do CDC), como nas hipóteses em que: (a) você aplicou Conteúdo Gerado sem a revisão exigida na cláusula 3.3; (b) você inseriu dados ou conteúdo em desacordo com a cláusula 8; (c) a perda de dados decorreu de exclusão feita por você; (d) o uso se deu em desacordo com estes Termos; (e) o evento decorreu de caso fortuito ou força maior, como falhas gerais de conectividade ou de energia.",
          "13.2. Decisões pedagógicas, avaliações, notas e consequências do uso do Conteúdo Gerado com alunos, famílias, instituições ou órgãos públicos são de responsabilidade do profissional que decidiu aplicá-lo, nos termos das cláusulas 3.2 e 9.3, sem prejuízo da responsabilidade do Olhar Singular por defeito do próprio serviço.",
          "13.3. O Mercado Pago, os provedores de inteligência artificial e os provedores de nuvem possuem termos e políticas próprios. O Olhar Singular responde perante você pelo serviço que presta, inclusive quando executado por meio desses fornecedores, e exerce contra eles o direito de regresso cabível. Falhas de operação atribuíveis a eles são tratadas na forma da cláusula 5.5 (devolução automática dos créditos reservados; na ISA, a conversa volta ao estado anterior sem novo custo) e, quando impedirem o uso do serviço por período relevante, geram a compensação proporcional do período pago.",
          "13.4. A Plataforma é fornecida com a garantia legal de adequação prevista nos arts. 20 e 24 do Código de Defesa do Consumidor. Não garantimos funcionamento ininterrupto (cláusula 3.6), mas respondemos por vício que torne o serviço impróprio ao fim a que se destina.",
        ],
      },
      {
        title: "14. Indenização",
        paragraphs: [
          "14.1. Cada parte responde pelos danos comprovados que causar à outra por ato ilícito, nos termos da lei. Se o Olhar Singular for demandado por terceiro em razão de Conteúdo do Usuário inserido em violação das cláusulas 8 ou 11, você responderá regressivamente pelos valores que ele for condenado a pagar, na medida da sua culpa.",
        ],
      },
      {
        title: "15. Privacidade e proteção de dados",
        paragraphs: [
          "15.1. O tratamento dos seus dados pessoais é regido pela Política de Privacidade, que integra estes Termos e detalha quais dados coletamos, para quê, com quem compartilhamos, por quanto tempo guardamos e como exercer os seus direitos previstos na Lei Geral de Proteção de Dados.",
        ],
      },
      {
        title: "16. Comunicações e suporte",
        paragraphs: [
          "16.1. O e-mail cadastrado é o canal oficial de comunicação entre você e o Olhar Singular. Mantenha-o atualizado: as mensagens enviadas a ele presumem-se recebidas, salvo prova em contrário.",
          "16.2. Comunicações transacionais (confirmação da contratação, lembrete da primeira cobrança do Teste Grátis, avisos sobre cobranças, renovações e falhas de pagamento quando enviados por nós ou pelo Mercado Pago, segurança da Conta e alterações destes Termos) são inerentes ao serviço e não dependem de consentimento. Comunicações promocionais, quando enviadas, podem ser descadastradas a qualquer momento pelo link presente na mensagem.",
          `16.3. O atendimento é feito ${SUPPORT_CHANNEL}. Confirmamos o recebimento de cada solicitação e respondemos em até ${SUPPORT_REPLY_BUSINESS_DAYS} dias úteis. Cancelamento e estorno da última cobrança são feitos em autoatendimento, na área Créditos, com confirmação imediata na tela.`,
        ],
      },
      {
        title: "17. Alterações destes Termos",
        paragraphs: [
          `17.1. Podemos alterar estes Termos. Alterações que afetem preço, cota ou custo em créditos, regras de reembolso, direitos ou obrigações entram em vigor no mínimo ${LEGAL_NOTICE_DAYS} dias após o aviso enviado ao seu e-mail e exibido na Plataforma; nesse prazo você pode cancelar a assinatura e encerrar a Conta sem qualquer ônus. Correções de erro material e melhorias de clareza que não alterem direitos valem na data da publicação. A versão vigente e a data de atualização constam no topo desta página.`,
          "17.2. O uso da Plataforma após a vigência de uma alteração relevante, da qual você foi avisado na forma da cláusula 17.1, representa aceite da nova versão. Se você não concordar, cancele a assinatura e solicite o encerramento da Conta antes da data de vigência.",
          "17.3. Versão atual: " + TERMS_VERSION + ".",
        ],
      },
      {
        title: "18. Disposições gerais",
        paragraphs: [
          "18.1. Estes Termos são regidos pelas leis da República Federativa do Brasil, em especial pelo Código de Defesa do Consumidor (Lei nº 8.078/1990), pelo Marco Civil da Internet (Lei nº 12.965/2014), pela Lei Geral de Proteção de Dados (Lei nº 13.709/2018), pelo Código Civil e pelo Decreto nº 7.962/2013.",
          `18.2. Para as relações de consumo, fica eleito o foro do domicílio do Usuário, nos termos do art. 101, inciso I, do Código de Defesa do Consumidor. Para as demais relações, fica eleito o foro da comarca de ${LEGAL_ENTITY.city}, com renúncia a qualquer outro, por mais privilegiado que seja. Antes de qualquer medida, incentivamos a solução amigável pelo Suporte ou pela plataforma consumidor.gov.br.`,
          "18.3. A eventual nulidade ou ineficácia de qualquer cláusula não prejudica as demais. A tolerância quanto ao descumprimento de qualquer obrigação não implica renúncia ao direito de exigi-la. O Olhar Singular poderá ceder este contrato em caso de reorganização societária, fusão, aquisição ou alienação de ativos, mediante comunicação a você, assegurado o direito de encerrar a Conta sem ônus. Estes Termos não criam vínculo societário, de franquia, de representação ou de emprego entre as partes.",
          "18.4. Este contrato vigora por prazo indeterminado, enquanto existir a sua Conta, e é celebrado em língua portuguesa, prevalecendo a versão em português sobre qualquer tradução.",
        ],
      },
    ],
  },
  privacidade: {
    title: "Política de Privacidade",
    updatedAt: LEGAL_UPDATED_AT,
    intro:
      "Esta Política de Privacidade explica como o Olhar Singular coleta, utiliza, compartilha, armazena e protege os dados pessoais de quem visita o site, cria uma conta ou utiliza a plataforma, em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018, LGPD), com o Marco Civil da Internet (Lei nº 12.965/2014) e com o Código de Defesa do Consumidor (Lei nº 8.078/1990).",
    sections: [
      {
        title: "1. Quem somos e a quem esta Política se aplica",
        paragraphs: [
          `1.1. A controladora dos dados pessoais tratados na plataforma é ${QUALIFICATION} ("Olhar Singular", "nós").`,
          `1.2. O encarregado pelo tratamento de dados pessoais (DPO) é ${LEGAL_ENTITY.dpo}, que pode ser contatado pelo e-mail ${LEGAL_ENTITY.email}. Quem tem conta na plataforma também pode encaminhar pedidos, dúvidas e reclamações sobre dados pessoais ${SUPPORT_CHANNEL}.`,
          "1.3. Esta Política se aplica aos visitantes do site, aos usuários da plataforma e a quem entra em contato conosco. Ela não se aplica a sites, aplicativos ou serviços de terceiros acessíveis por links, que possuem políticas próprias.",
        ],
      },
      {
        title: "2. Definições",
        paragraphs: [
          '2.1. "Dado pessoal" é a informação relacionada a pessoa natural identificada ou identificável; "dado pessoal sensível" é o dado sobre origem racial ou étnica, convicção religiosa, opinião política, saúde, vida sexual, dado genético ou biométrico, entre outros; "titular" é a pessoa a quem os dados se referem; "tratamento" é qualquer operação com dados pessoais, como coleta, uso, armazenamento, compartilhamento e eliminação; "controlador" é quem decide sobre o tratamento; "operador" é quem trata dados em nome do controlador; "consentimento" é a manifestação livre, informada e inequívoca do titular; "cookies" são pequenos arquivos ou registros gravados no navegador; "pseudonimização" é o tratamento que impede a associação direta a uma pessoa sem informação adicional, e não se confunde com anonimização.',
        ],
      },
      {
        title: "3. Quais dados coletamos",
        paragraphs: [
          "3.1. Dados que você nos fornece: nome completo e e-mail, no cadastro ou no checkout; CPF do titular do cartão, informado ao Mercado Pago no checkout e armazenado por nós para fins fiscais, de prevenção à fraude e de controle de um teste grátis por pessoa; senha, armazenada apenas de forma criptografada (hash) pelo provedor de autenticação; o conteúdo que você cria ou envia, como atividades, provas, arquivos PDF e DOCX, perfis de barreira e observações, questões do banco (texto e imagens), adaptações e as mensagens trocadas com a ISA; e as mensagens enviadas ao Suporte. As imagens anexadas a questões ficam em um repositório acessível por link não listado; não anexe imagens que contenham dados pessoais.",
          "3.2. Dados de pagamento: o número completo do cartão, a validade e o código de segurança são coletados diretamente pelo Mercado Pago, por meio de componente seguro embutido na página de pagamento, e nunca transitam nem são armazenados em nossos servidores. Guardamos apenas a bandeira e os quatro últimos dígitos do cartão, o e-mail do pagador, os identificadores de pagamento e de assinatura gerados pelo Mercado Pago, valores, datas, status, histórico de faturas e de estornos.",
          "3.3. Dados gerados pelo uso: saldo e histórico de créditos; registros das operações de inteligência artificial (tipo de operação, modelo utilizado, quantidade de tokens, duração, custo e status, e também o nome do arquivo enviado e a mensagem técnica de erro, quando houver, nunca o texto da atividade; por isso, não use nomes de alunos nem outros dados pessoais no nome dos arquivos que você envia); data do último acesso; versão e data de aceite dos Termos de Uso, registradas no checkout; registros das ações realizadas pela nossa equipe sobre a sua conta (por exemplo, concessão de créditos ou alteração de e-mail), mantidos para auditoria.",
          "3.4. Dados técnicos: endereço IP, identificadores de dispositivo e navegador, páginas acessadas, data e hora de acesso, registros de erro e os registros de acesso à aplicação exigidos pelo Marco Civil da Internet. No checkout, guardamos por até 24 horas um resumo criptográfico irreversível (hash) do IP e do e-mail, usado exclusivamente para limitar tentativas e prevenir fraude; os registros vencidos são eliminados na verificação seguinte.",
          "3.5. Dados de navegação e marketing, apenas com o seu consentimento: cookies e identificadores do Google Analytics e do Google Tag Manager, do Pixel da Meta, parâmetros de campanha presentes no endereço de acesso (utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid), cookies de atribuição (_ga, _fbp e _fbc) e a origem da visita.",
          "3.6. Não coletamos intencionalmente dados pessoais sensíveis a seu respeito. Sobre dados de alunos e de terceiros, veja a cláusula 4.",
        ],
      },
      {
        title: "4. Dados de alunos e de terceiros",
        paragraphs: [
          `4.1. A plataforma foi desenhada para trabalhar com barreiras pedagógicas observáveis em sala, e não com identidades. Não insira dados pessoais de alunos ou de terceiros, em especial: ${STUDENT_DATA_BAN}. A descrição das barreiras observadas não precisa identificar ninguém.`,
          "4.2. Dados de crianças e adolescentes e dados de saúde recebem proteção reforçada pela LGPD (arts. 11 e 14) e pelo Estatuto da Criança e do Adolescente. Se, apesar da orientação, você inserir esses dados, você responde como controlador, inclusive pela obtenção do consentimento dos responsáveis legais quando exigido. O Olhar Singular atua como operador, tratando-os exclusivamente para gerar o resultado solicitado por você, sem nenhuma outra finalidade, e responde na medida da sua participação, nos termos do art. 42 da LGPD.",
          `4.3. Medidas de proteção: os perfis de barreira não possuem campo de identificação do aluno; a plataforma e esta Política orientam o uso de descrições genéricas; o conteúdo não é compartilhado com outros usuários nem usado para treinar modelos; e você pode excluir qualquer item a qualquer momento. Responsáveis legais, instituições de ensino e o próprio usuário podem solicitar a localização e a eliminação de dados de criança, adolescente ou terceiro ${SUPPORT_CHANNEL} ou pelos canais de contato do Olhar Singular, com atendimento em até ${SUPPORT_REPLY_BUSINESS_DAYS} dias úteis.`,
        ],
      },
      {
        title: "5. Para que usamos os dados e com base em quê",
        paragraphs: [
          "5.1. Execução do contrato (art. 7º, V, da LGPD): criar e manter a sua conta, autenticar o acesso, gerar adaptações, extrair questões, operar a ISA, controlar créditos, processar cobranças e estornos, prestar suporte e enviar comunicações transacionais.",
          "5.2. Cumprimento de obrigação legal ou regulatória (art. 7º, II): emissão e guarda de documentos fiscais e contábeis, guarda dos registros de acesso pelo prazo do Marco Civil da Internet, registro do aceite dos Termos de Uso e atendimento a requisições de autoridades.",
          "5.3. Legítimo interesse (art. 7º, IX), avaliado de modo a não ferir as suas expectativas legítimas e os seus direitos: prevenção à fraude e segurança da plataforma (limitação de tentativas no checkout, controle de um teste grátis por CPF, suspensão de contas em caso de fraude); melhoria do serviço a partir de dados agregados ou anonimizados; medição de conversão das nossas campanhas por meio dos eventos descritos na cláusula 7.2, enviados ao Google Analytics e à Meta com identificadores pseudonimizados, valor e moeda, sem o seu nome e, salvo consentimento, sem o seu e-mail nem cookies de anúncios; e defesa dos nossos direitos. Você pode se opor a esses tratamentos na forma da cláusula 12.",
          "5.4. Exercício regular de direitos (art. 7º, VI): guarda de registros de aceite, pagamentos, estornos e comunicações para uso em eventual processo administrativo, judicial ou arbitral.",
          "5.5. Consentimento (art. 7º, I): cookies e identificadores de medição e marketing; inclusão do seu e-mail (de forma criptografada por hash) e dos cookies de anúncios nos eventos de conversão enviados à Meta; e eventuais comunicações promocionais. O consentimento pode ser revogado a qualquer momento, sem prejuízo do tratamento realizado anteriormente. Se você não consentir, a plataforma funciona normalmente: a única consequência é não participarmos da medição de campanhas com os seus dados.",
          `5.6. Decisões automatizadas. Algumas medidas de segurança são aplicadas automaticamente: limitação de tentativas no checkout, recusa de novo teste grátis para CPF que já o utilizou e análise antifraude do Mercado Pago no pagamento. Nos termos do art. 20 da LGPD, você pode pedir a revisão dessas decisões por uma pessoa da nossa equipe ${SUPPORT_CHANNEL}, com resposta em até ${SUPPORT_REPLY_BUSINESS_DAYS} dias úteis, e informaremos os critérios utilizados, resguardados os segredos comerciais e de segurança.`,
        ],
      },
      {
        title: "6. Inteligência artificial",
        paragraphs: [
          "6.1. Para gerar adaptações, extrair questões de arquivos e operar a ISA, o texto da atividade, as barreiras selecionadas, as observações pedagógicas e, no chat, as mensagens da conversa são enviados a um provedor de inteligência artificial contratado pelo Olhar Singular, atualmente a API Gemini, do Google. O provedor atua como operador e trata esses dados somente para produzir a resposta solicitada, conforme os termos aplicáveis ao uso pago da API, que vedam o uso dos dados para treinamento dos modelos e limitam a retenção a fins de segurança e prevenção de abuso.",
          "6.2. Não utilizamos o seu conteúdo nem o Conteúdo Gerado para treinar modelos de inteligência artificial próprios ou de terceiros.",
          "6.3. Guardamos apenas metadados de cada operação (tipo, modelo, tokens, duração, custo, status e, quando houver, o nome do arquivo enviado e a mensagem técnica de erro) para controle de créditos, auditoria de cobranças e melhoria do serviço. O texto enviado não fica armazenado nesse registro; por isso, não use nomes de alunos ou outros dados pessoais no nome dos arquivos. O resultado da adaptação, da extração ou da conversa fica salvo na sua conta até que você o exclua.",
          "6.4. O Conteúdo Gerado pode conter erros e deve ser revisado por você antes de qualquer uso, conforme os Termos de Uso.",
        ],
      },
      {
        title: "7. Com quem compartilhamos",
        paragraphs: [
          "7.1. Compartilhamos dados pessoais apenas na medida necessária à prestação do serviço, sob obrigações contratuais de confidencialidade e segurança, com: Supabase (banco de dados, autenticação, armazenamento de arquivos e funções de servidor), como operador; Vercel (hospedagem do site e da aplicação), como operador; Mercado Pago (processamento de pagamentos, assinaturas, estornos e análise antifraude), que atua como controlador independente dos dados de pagamento, sob a sua própria política de privacidade; Google (API Gemini para inteligência artificial, como operador, e Google Analytics e Google Tag Manager para medição, nos termos das cláusulas 5.3 e 9); Meta Platforms (Pixel e API de Conversões para medição de campanhas, nos termos das cláusulas 5.3, 5.5 e 9), que define as próprias finalidades sobre os dados que recebe; Resend (envio de e-mails transacionais, como link de acesso, redefinição de senha, confirmação da contratação e lembrete do teste grátis), como operador.",
          "7.2. Enviamos ao Google Analytics e à Meta um evento de conversão nestes momentos: início de assinatura ou de teste grátis, compra de créditos, renovação da assinatura, falha de pagamento, cancelamento e estorno. Ao Google Analytics vai o identificador interno da sua conta (um código pseudonimizado, que não é o seu nome nem o seu e-mail) e, se você tiver aceitado cookies de medição, o identificador do cookie _ga; à Meta vai esse identificador interno em hash irreversível (SHA-256). Os dois recebem o valor e a moeda da transação, com base no legítimo interesse descrito na cláusula 5.3. O seu e-mail (em hash) e os cookies de anúncios (_fbp e _fbc) só são incluídos no envio à Meta se você tiver aceitado cookies de marketing na faixa de consentimento.",
          "7.3. Também podemos compartilhar dados com autoridades públicas, judiciais ou administrativas quando exigido por lei, ordem judicial ou requisição válida, e para o exercício regular dos nossos direitos.",
          "7.4. Em caso de reorganização societária, fusão, aquisição ou alienação de ativos, os dados poderão ser transferidos ao sucessor, que ficará vinculado a esta Política, com comunicação a você e direito de encerrar a conta.",
          "7.5. Nunca vendemos, alugamos ou cedemos dados pessoais a terceiros para fins de marketing próprio deles.",
          "7.6. O acesso interno aos seus dados é restrito à equipe do Olhar Singular com função administrativa, limitado ao necessário para suporte, cobrança e segurança, e todas as ações administrativas sobre contas são registradas para auditoria.",
        ],
      },
      {
        title: "8. Transferência internacional",
        paragraphs: [
          "8.1. Os fornecedores listados na cláusula 7 podem armazenar ou processar dados em servidores localizados fora do Brasil, especialmente nos Estados Unidos da América. Essas transferências são realizadas com base no art. 33 da LGPD, por meio das cláusulas-padrão contratuais aprovadas pela Autoridade Nacional de Proteção de Dados (Resolução CD/ANPD nº 19/2024) ou de outro mecanismo admitido pela lei e pela regulamentação, incorporados aos contratos com os fornecedores.",
          "8.2. Selecionamos fornecedores que adotam padrões de segurança reconhecidos internacionalmente e que se comprometem contratualmente a tratar os dados apenas conforme nossas instruções ou, quando controladores, conforme política de privacidade própria compatível com a LGPD.",
        ],
      },
      {
        title: "9. Cookies e tecnologias semelhantes",
        paragraphs: [
          "9.1. Essenciais (não dependem de consentimento): mantêm a sua sessão autenticada, guardam a sua escolha sobre cookies, protegem o checkout contra fraude e permitem o funcionamento do componente de pagamento do Mercado Pago. Sem eles a plataforma não funciona.",
          "9.2. Medição (dependem de consentimento): Google Analytics 4, carregado pelo Google Tag Manager, registra páginas visitadas, eventos de navegação e origem da visita por meio de cookies como o _ga, para entendermos o que funciona no site.",
          "9.3. Marketing (dependem de consentimento): Pixel da Meta e identificadores do Google Ads registram visitas e conversões, por meio de cookies como _fbp e _fbc e dos parâmetros gclid e fbclid, para medir campanhas e evitar anúncios repetidos.",
          "9.4. Usamos o Modo de Consentimento do Google (Consent Mode v2): todas as categorias não essenciais ficam negadas até que você decida na faixa exibida no site, escolhendo \"Só essenciais\" ou \"Aceitar\". Não injetamos novos scripts de medição ou marketing nas páginas de pagamento e de definição de senha; os já carregados com o seu consentimento em páginas anteriores podem permanecer ativos durante a mesma navegação.",
          '9.5. A sua escolha fica salva no seu navegador, junto com a versão da faixa de consentimento; quando o aviso muda, perguntamos de novo. Você pode alterar a escolha a qualquer momento pelo link "Preferências de cookies", disponível no rodapé do site e no menu da sua conta, que reabre a faixa com as mesmas opções; a decisão anterior continua valendo até que você clique em uma delas. Como alternativa, apagar os dados deste site nas configurações do navegador também faz a faixa aparecer de novo no próximo acesso, e você pode bloquear cookies de terceiros diretamente no navegador, sem prejuízo das funcionalidades essenciais.',
          "9.6. Os parâmetros de campanha presentes no endereço pelo qual você chegou ao site ficam guardados no seu navegador para atribuir a origem de uma eventual assinatura. Com o seu consentimento, essa origem é associada à assinatura; sem ele, apenas a origem genérica da visita é considerada.",
        ],
      },
      {
        title: "10. Por quanto tempo guardamos",
        paragraphs: [
          "10.1. Dados cadastrais e de conta: enquanto a conta existir. Após a exclusão, são eliminados em até 30 dias, salvo os dados cuja guarda seja obrigatória por lei.",
          "10.2. Conteúdo (adaptações, perfis de barreira, questões, arquivos enviados e conversas com a ISA): enquanto você os mantiver na plataforma. Você pode excluir itens a qualquer momento, e todos são eliminados com a exclusão da conta.",
          "10.3. Registros financeiros (pagamentos, faturas, estornos, CPF do titular do cartão e aceite dos Termos de Uso): por 5 anos após o término da relação, para cumprimento de obrigações fiscais e para o exercício regular de direitos, com acesso restrito.",
          "10.4. Registros de acesso à aplicação: por 6 meses, conforme o art. 15 do Marco Civil da Internet. Resumos criptográficos (hash) de IP e e-mail do checkout: por até 24 horas, eliminados na verificação seguinte.",
          "10.5. Metadados das operações de inteligência artificial: enquanto a conta existir e, depois, por até 5 anos, junto com os registros financeiros, para auditoria de cobranças e exercício regular de direitos.",
          "10.6. Dados de medição e marketing: pelos prazos de retenção configurados nas ferramentas dos provedores e enquanto o seu consentimento permanecer válido.",
          "10.7. Cópias de segurança são sobrescritas em ciclos regulares, normalmente em até 30 dias. Dados anonimizados, que não permitem identificar você, podem ser mantidos por prazo indeterminado para fins estatísticos.",
        ],
      },
      {
        title: "11. Como protegemos os dados",
        paragraphs: [
          "11.1. Adotamos medidas técnicas e administrativas adequadas, entre elas: criptografia dos dados em trânsito (TLS) e em repouso nos provedores; isolamento dos dados de cada usuário por políticas de acesso no banco de dados; senhas armazenadas apenas em hash; acesso administrativo restrito, com registro de todas as ações; limitação de tentativas e análise antifraude no checkout; e tratamento dos dados de cartão exclusivamente pelo Mercado Pago, em ambiente certificado PCI DSS.",
          "11.2. Nenhum sistema é totalmente imune a incidentes. Você contribui para a segurança mantendo a senha em sigilo, utilizando dispositivos confiáveis e avisando o Suporte sobre qualquer acesso suspeito.",
          "11.3. Em caso de incidente de segurança que possa acarretar risco ou dano relevante a você, comunicaremos a ANPD e os titulares afetados em até 3 dias úteis a contar da ciência do incidente, nos termos do art. 48 da LGPD e da Resolução CD/ANPD nº 15/2024, informando a natureza dos dados atingidos, os riscos e as medidas adotadas.",
        ],
      },
      {
        title: "12. Seus direitos",
        paragraphs: [
          "12.1. Nos termos do art. 18 da LGPD, você pode, a qualquer momento e gratuitamente, solicitar: confirmação da existência de tratamento; acesso aos seus dados; correção de dados incompletos, inexatos ou desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a lei; portabilidade dos dados a outro fornecedor; eliminação dos dados tratados com base no consentimento; informação sobre com quem compartilhamos os seus dados; informação sobre a possibilidade de não fornecer consentimento e suas consequências; revogação do consentimento; e oposição a tratamento realizado com base em outra hipótese legal, quando houver descumprimento da LGPD. Você também pode solicitar a revisão de decisões tomadas unicamente com base em tratamento automatizado (cláusula 5.6).",
          `12.2. Para exercer esses direitos, entre em contato ${SUPPORT_CHANNEL}. Para a sua segurança, poderemos solicitar a confirmação da sua identidade antes de atender ao pedido. Confirmamos o recebimento e respondemos em até 15 dias, conforme o art. 19 da LGPD.`,
          "12.3. Alguns pedidos podem ser atendidos apenas parcialmente quando houver obrigação legal de guarda dos dados ou quando o tratamento for necessário ao exercício regular de direitos. Nesses casos, informaremos os motivos.",
          "12.4. Se entender que o tratamento dos seus dados viola a LGPD, você pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD), em gov.br/anpd, sem prejuízo dos demais meios de defesa.",
        ],
      },
      {
        title: "13. Exclusão da conta",
        paragraphs: [
          `13.1. Você pode solicitar a exclusão da sua conta a qualquer momento ${SUPPORT_CHANNEL}. Antes disso, cancele a assinatura ativa na área Créditos; se não o fizer, nós a cancelaremos junto com a exclusão. Antes de concluir, informaremos o saldo de Créditos Extras e as opções da cláusula 12.3 dos Termos de Uso.`,
          "13.2. Com a exclusão, são eliminados o perfil, as adaptações, os perfis de barreira, o banco de questões, os arquivos enviados e as conversas com a ISA. Os registros financeiros e de aceite dos Termos permanecem apenas pelo prazo e com o acesso restrito indicados na cláusula 10. A exclusão é irreversível.",
          "13.3. Você pode excluir itens individuais (adaptações, perfis, questões, arquivos e conversas) diretamente na plataforma, sem encerrar a conta.",
        ],
      },
      {
        title: "14. Crianças e adolescentes",
        paragraphs: [
          "14.1. A plataforma destina-se a maiores de 18 anos e não coletamos intencionalmente dados pessoais de menores como usuários. Se tomarmos conhecimento de uma conta criada por menor de 18 anos, ela será encerrada e os dados eliminados. Sobre dados de alunos eventualmente inseridos por educadores, aplica-se a cláusula 4.",
        ],
      },
      {
        title: "15. Alterações desta Política",
        paragraphs: [
          `15.1. Podemos atualizar esta Política para refletir mudanças na plataforma, nos fornecedores ou na legislação. Alterações que ampliem o tratamento, mudem finalidades ou acrescentem compartilhamentos serão comunicadas por e-mail e por aviso na plataforma com antecedência mínima de ${LEGAL_NOTICE_DAYS} dias, e, quando dependerem de consentimento, ele será solicitado novamente. A data de atualização consta no topo desta página. Quando a faixa de cookies mudar, o seu consentimento será solicitado novamente.`,
        ],
      },
      {
        title: "16. Contato",
        paragraphs: [
          `16.1. Dúvidas, pedidos e reclamações sobre dados pessoais devem ser dirigidos ao encarregado, ${LEGAL_ENTITY.dpo}, pelo e-mail ${LEGAL_ENTITY.email} ou, para quem tem conta, ${SUPPORT_CHANNEL}.`,
        ],
      },
    ],
  },
  reembolso: {
    title: "Política de Reembolso",
    updatedAt: LEGAL_UPDATED_AT,
    intro:
      "Esta Política de Reembolso estabelece as regras de arrependimento, cancelamento, estorno e cobranças indevidas na plataforma Olhar Singular, em conformidade com o Código de Defesa do Consumidor (Lei nº 8.078/1990) e com o Decreto nº 7.962/2013. Ela complementa os Termos de Uso e é aceita junto com eles no checkout.",
    sections: [
      {
        title: "1. Direito de arrependimento",
        paragraphs: [
          "1.1. Por se tratar de contratação à distância, você pode desistir da assinatura ou da compra de créditos extras em até 7 dias corridos a contar da contratação ou da compra, nos termos do art. 49 do Código de Defesa do Consumidor, com devolução dos valores pagos. No teste grátis, o prazo para a primeira cobrança conta-se da data em que ela é efetuada.",
          "1.2. Para a assinatura, o Olhar Singular oferece condições mais amplas que o prazo legal, descritas na cláusula 2, pela mesma ferramenta usada na contratação (a área Créditos). Para os créditos extras, aplica-se a cláusula 4.",
        ],
      },
      {
        title: "2. Estorno da última cobrança da assinatura",
        paragraphs: [
          `2.1. Você pode pedir o estorno integral da última cobrança da assinatura a qualquer momento, na área Créditos, com um clique, enquanto a assinatura estiver ativa ou em até ${REFUND_WINDOW_DAYS} dias após cancelá-la. O estorno vale mesmo que parte dos créditos daquele mês já tenha sido utilizada, e a confirmação aparece imediatamente na tela.`,
          "2.2. Ao estornar, os créditos restantes do plano daquele mês são removidos e a assinatura é cancelada na hora. Os créditos extras avulsos permanecem na conta. Cobranças anteriores à última não são estornadas, e cada cobrança só pode ser estornada uma vez.",
          "2.3. Depois do estorno, uma nova assinatura corresponde a uma nova contratação, sujeita às regras vigentes. Essa garantia contratual é mais ampla que o direito de arrependimento legal e não reduz nenhum direito seu. Ciclos de assinatura e estorno usados para obter créditos sem pagamento, com indícios de fraude, são tratados conforme a cláusula 12 dos Termos de Uso, sempre com direito a contestação.",
        ],
      },
      {
        title: "3. Teste grátis",
        paragraphs: [
          `3.1. Durante o teste grátis de ${TRIAL_DAYS} dias nada é cobrado. A pré-autorização ou cobrança simbólica usada para validar o cartão, quando existe, é estornada automaticamente pela operadora, podendo levar até duas faturas para desaparecer.`,
          `3.2. Cancelando antes do ${FIRST_CHARGE_DAY}º dia, na área Créditos, nenhuma cobrança é feita e o acesso aos créditos do teste encerra na hora. A primeira cobrança, feita no ${FIRST_CHARGE_DAY}º dia, na data e pelo valor informados no checkout, é considerada a última cobrança da assinatura e pode ser estornada integralmente nos termos da cláusula 2.`,
          "3.3. Quando faltarem até 48 horas para a primeira cobrança, enviamos um lembrete por e-mail com a data e o valor da cobrança, a data limite para cancelar (o dia anterior) e o link para cancelar na área Créditos, com reenvio automático se o envio falhar. Se, por falha nossa, esse lembrete não for enviado ou for enviado com menos de 24 horas de antecedência, a primeira cobrança pode ser estornada integralmente a pedido, pelo suporte no menu da sua conta, sem prejuízo do estorno em autoatendimento da cláusula 2.",
        ],
      },
      {
        title: "4. Créditos extras avulsos",
        paragraphs: [
          `4.1. Em até ${EXTRAS_REFUND_DAYS} dias corridos após a compra de créditos extras, você pode desistir dela com devolução do valor pago. Se nenhum crédito do pacote tiver sido usado, a devolução é integral; se parte já tiver sido consumida, a devolução é proporcional aos créditos não utilizados, calculada pelo preço unitário do pacote comprado. Peça pelo suporte no menu da sua conta.`,
          `4.2. Confirmamos o recebimento do pedido e o estorno é solicitado ao Mercado Pago em até ${SUPPORT_REPLY_BUSINESS_DAYS} dias úteis. Após o prazo da cláusula 4.1, os créditos extras não são reembolsáveis, mas permanecem na conta sem expirar, com ou sem assinatura ativa.`,
        ],
      },
      {
        title: "5. Cobranças indevidas ou em duplicidade",
        paragraphs: [
          `5.1. Se identificar uma cobrança indevida, em duplicidade ou em valor diferente do contratado, comunique o suporte pelo menu da sua conta, informando a data e o valor. Confirmada a irregularidade, o valor é estornado integralmente pelo mesmo meio de pagamento, com a solicitação ao Mercado Pago em até ${SUPPORT_REPLY_BUSINESS_DAYS} dias úteis.`,
        ],
      },
      {
        title: "6. Como e quando o valor volta",
        paragraphs: [
          "6.1. Os estornos são processados pelo Mercado Pago. Pagamentos com cartão de crédito são devolvidos no mesmo cartão e podem levar até duas faturas para aparecer, conforme o banco emissor. Pagamentos por Pix são devolvidos à conta de origem do pagamento.",
          "6.2. Os reembolsos são feitos pelo mesmo meio de pagamento utilizado. Se o cartão tiver sido cancelado, o banco emissor repassa o valor ao titular; havendo impossibilidade comprovada, o suporte combina outro meio com você. Eventuais tarifas, juros ou variações cobrados pelo banco emissor não são de responsabilidade do Olhar Singular.",
        ],
      },
      {
        title: "7. Contestação junto à operadora do cartão",
        paragraphs: [
          "7.1. Contestar uma cobrança junto ao banco ou à operadora do cartão é um direito seu. Antes disso, recomendamos usar o estorno em autoatendimento da cláusula 2 ou o suporte, que são mais rápidos. Se a operadora reverter uma cobrança de créditos já consumidos e, após o nosso contato, a cobrança for reconhecida como legítima, poderemos suspender a conta até a regularização do valor correspondente aos créditos efetivamente utilizados, com direito a contestação na forma dos Termos de Uso.",
        ],
      },
      {
        title: "8. Encerramento pela plataforma",
        paragraphs: [
          "8.1. Se o Olhar Singular encerrar a sua conta por iniciativa própria sem fraude comprovada, ou descontinuar o serviço, devolveremos os valores pagos pelo período não usufruído e pelos créditos extras não utilizados. No encerramento por fraude comprovada, apenas os créditos obtidos com a operação fraudulenta são cancelados, nos termos da cláusula 12 dos Termos de Uso.",
        ],
      },
    ],
  },
};

export function isLegalSlug(value: string | undefined): value is LegalSlug {
  return value === "termos" || value === "privacidade" || value === "reembolso";
}

// Mounted at /termos, /privacidade and /reembolso: the path is the document.
