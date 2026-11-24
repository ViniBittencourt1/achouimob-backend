import { runNiteroiProject } from "../runProject.js";

await runNiteroiProject({
  projectName: "nitElenco",
  displayName: "Elenco Imóveis",
  baseUrl: "https://www.elencoimoveis.com.br/imoveis/a-venda",
});
