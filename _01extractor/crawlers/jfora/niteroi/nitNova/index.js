import { runNiteroiProject } from "../runProject.js";

await runNiteroiProject({
  projectName: "nitNova",
  displayName: "Nova Imobiliária",
  baseUrl: "https://www.novaimobiliaria.imb.br/imoveis/a-venda",
});
