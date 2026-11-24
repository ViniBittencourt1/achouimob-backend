import { runNiteroiProject } from "../runProject.js";

await runNiteroiProject({
  projectName: "nitAmin",
  displayName: "Amim Imóveis",
  baseUrl: "https://www.amimimoveis.com.br/imoveis/a-venda",
});
