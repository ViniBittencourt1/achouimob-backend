// Gera o HTML do card de contato da imobiliária
export function getContatoHtml() {
  return `
<article class="grid-12 bloco-local cinza-bg">
  <address class="endereco-local-rodape">
    <div><i class="fa fa-map-marker vermelho" aria-hidden="true"></i></div>
    <span>
      Avenida Barão do Rio Branco, 2828, Juiz de Fora<br>
      CRECI: 46286<br>
      <strong class="endereco-local-horario">Horário de atendimento: <br></strong>
      Segunda a Domingo das 8:00 as 20:00<br>
    </span>
  </address>
  <address class="endereco-local-rodape">
    <div><i class="fa fa-phone vermelho" aria-hidden="true"></i></div>
    <span class="endereco-local-fone"><a href="tel:(32) 99155-2400">(32) 99155-2400</a></span>
  </address>
</article>
  `;
}
// Retorna HTML fixo do corretor com dados da Decisao Negócios Imobiliários
export function extractLinkCard() {
	return 0;
}
