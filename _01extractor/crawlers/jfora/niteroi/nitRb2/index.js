import { runNiteroiProject } from "../runProject.js";

await runNiteroiProject({
  projectName: "nitRb2",
  displayName: "RB2 Imóveis",
  baseUrl: "https://www.rb2imoveis.com.br/imoveis/a-venda",
});
