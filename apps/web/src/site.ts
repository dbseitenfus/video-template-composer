/**
 * Textos da página inicial. Ficam aqui para trocar de campanha (ou deixar o app neutro)
 * sem mexer nos componentes.
 */
export const site = {
  brand: 'gravaí',
  /** Endereço gravado no canto inferior direito de todo vídeo exportado (e no preview). */
  watermark: 'gravai.pages.dev',
  eyebrow: 'Segundo turno',
  headline: 'Grave um vídeo com seu rosto para o segundo turno',
  subheadline:
    'É simples: siga os passos abaixo. Em poucos minutos o vídeo fica pronto, com abertura, legendas e trilha, para mandar no WhatsApp e postar nas redes.',
  cta: 'Começar a gravar',
  steps: [
    { title: 'Escolha um modelo', text: 'Vertical para Stories e WhatsApp, ou quadrado para o feed.' },
    { title: 'Grave cada trecho', text: 'O roteiro aparece na tela e rola sozinho. É só ler olhando para a câmera.' },
    { title: 'Revise', text: 'Assista e grave de novo o que não gostou, quantas vezes quiser.' },
    { title: 'Compartilhe', text: 'O app monta o vídeo e você manda direto no WhatsApp ou nas redes.' },
  ],
  privacy: 'Seus vídeos ficam no seu celular. Nada é enviado para servidores.',
  /** Aviso de independência: curto no topo, completo no rodapé. */
  disclaimer: {
    short: 'Iniciativa independente, sem vínculo com a campanha oficial.',
    full: 'O gravaí é uma iniciativa independente e voluntária. Não tem relação com a campanha oficial de Lula, com partidos ou coligações, e não é mantido, financiado nem autorizado por eles.',
  },
  /** Linha opcional no rodapé (ex.: identificação de quem mantém a página). */
  footnote: '',
  /** Crédito de autoria no rodapé. */
  credit: { name: 'Daniel Seitenfus', url: 'https://github.com/dbseitenfus' },
}
