import { runNiteroiProject } from "../runProject.js";

await runNiteroiProject({
  projectName: "nitMrm",
  displayName: "MRM Imobiliária",
  baseUrl: "https://www.mrmimobiliaria.com.br/imoveis/a-venda",
});
