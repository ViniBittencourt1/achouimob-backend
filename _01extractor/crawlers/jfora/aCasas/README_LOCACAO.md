# A Casas: locacao

## Sheets unificado de Juiz de Fora

Vendas e alugueis usam a mesma planilha principal e a mesma aba da imobiliaria.
As 20 colunas originais sao preservadas, com a coluna U `negociacao` ao fim:
`venda` ou `aluguel`. Cada envio substitui somente sua negociacao, preservando
a outra (inclusive quando a coleta vazia foi confirmada). Os JSONs continuam
separados. O destino padrao vem de `_utils/jfSheetsConfig.js`, e nao da variavel
`GOOGLE_SHEETS_SPREADSHEET_ID`. Retirados de aluguel usam `retiradosLocacao`;
suas contagens usam `retornoLocacao`, na mesma planilha principal.
Os dados da planilha antiga nao sao migrados automaticamente: a principal
sera atualizada nas proximas raspagens.


Execute a partir da raiz do projeto:

```powershell
npm --prefix backend run acasas:locacao
```

- Busca: https://acasas.com.br/pesquisa?transacao=Loca%C3%A7%C3%A3o&ordena=menor_valor
- JSON independente: `backend/crawler/jfACasasLocacao.json`.
- Planilha principal (vendas e alugueis): https://docs.google.com/spreadsheets/d/1Mh_Y5bktbdyIB_bRs_QYUHkKBDuYfTHfDZSPJVBz0FY/edit
- Aba herdada: `jfACasas`, selecionada por nome, nunca pelo gid do link.

O titulo recebe o texto de `.search-feat-card__taxas`, separado por ` | `.
Exemplo: `Apartamento | IPTU: R$ 35,00 / Condominio: R$ 280,00 / Valor total: R$ 865,00`.
O texto original do site e mantido, incluindo acentos e valores. Quando
nao houver taxas, o titulo permanece sem complemento.
O campo `preco` preserva o aluguel do card, sem ser substituido pelo
valor total com taxas encontrado na pagina de detalhes.

Os extratores, a paginacao e a consolidacao de inclusoes/exclusoes sao
reutilizados. O historico e lido apenas do JSON de locacao; vendas nao
recebe taxas no titulo e continua com o comando `npm run acasas`.
O destino padrao de vendas e alugueis e definido em `_utils/jfSheetsConfig.js`.

Locacao nao publica no Firestore nem entra no agendamento de vendas.
Coleta vazia ou erro de pagina aborta sem sobrescrever os dados anteriores.
O navegador tenta o modo visivel se houver bloqueio ou coleta vazia em
headless. O JSON e salvo antes da exportacao ao Sheets.

Testes a partir da raiz (Node 22.20 ou superior):

```powershell
node --experimental-test-module-mocks --test backend/_01extractor/crawlers/jfora/aCasas/locacao.test.js backend/_01extractor/crawlers/jfora/aCasas/extractor-04-localizacao.test.js
```