import { runNiteroiProject } from "../runProject.js";

await runNiteroiProject({
  projectName: "nitColuna",
  displayName: "Coluna Imóveis",
  baseUrl: "https://www.colunaimoveis.com.br/imoveis/a-venda",
});
