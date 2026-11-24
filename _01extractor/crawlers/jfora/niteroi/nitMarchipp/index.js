import { runNiteroiProject } from "../runProject.js";

await runNiteroiProject({
  projectName: "nitMarchipp",
  displayName: "Marchipp Imóveis",
  baseUrl: "https://www.marchippimoveis.com.br/imoveis/a-venda",
});
