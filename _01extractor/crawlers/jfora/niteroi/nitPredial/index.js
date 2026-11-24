import { runNiteroiProject } from "../runProject.js";

await runNiteroiProject({
  projectName: "nitPredial",
  displayName: "Predial Imobiliária",
  baseUrl: "https://www.predialimobiliaria.com/imoveis?finalidade=venda",
});
