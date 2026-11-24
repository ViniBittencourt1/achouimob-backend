import assert from "node:assert/strict";
import { test } from "node:test";
import { exportToSheets } from "./sheets.js";
import { CABECALHO_IMOVEIS_SHEETS } from "../_utils/imoveisSheets.js";

test("jfGm formata atualizadoEm no horario de Sao Paulo ao enviar ao Sheets", async () => {
  const rows = [
    { linkReal: "iso", dataInclusao: "2026-11-16", atualizadoEm: "2026-11-16T08:12:44.918Z" },
    { linkReal: "virada", atualizadoEm: "2026-11-16T02:12:45.049Z" },
    { linkReal: "date", atualizadoEm: new Date("2026-11-16T08:12:45.074Z") },
    { linkReal: "firestore", atualizadoEm: { _seconds: 1794816765, _nanoseconds: 96000000 } },
    { linkReal: "formatado", atualizadoEm: "16/11/2026 04:48:10" },
    { linkReal: "vazio" },
  ];
  let written;
  const api = {
    ensureSheet: async (_id, title) => title,
    readSheet: async () => [CABECALHO_IMOVEIS_SHEETS],
    clearSheet: async () => {},
    writeHeader: async (_id, _title, header) => assert.deepEqual(header, CABECALHO_IMOVEIS_SHEETS),
    writeSheet: async (_id, range, values) => {
      assert.equal(range, "'jfGm'!A2:U7");
      written = values;
    },
  };

  await exportToSheets(new Map(rows.map(row => [row.linkReal, row])), { spreadsheetId: "test" }, api);

  assert.deepEqual(written.map(row => row[19]), [
    "16/11/2026 05:12:44",
    "15/11/2026 23:12:45",
    "16/11/2026 05:12:45",
    "16/11/2026 05:12:45",
    "16/11/2026 04:48:10",
    "",
  ]);
  assert.equal(written[0][16], "2026-11-16");
  assert.ok(written.every(row => row.length === 21 && row[20] === "venda"));
  assert.equal(rows[0].atualizadoEm, "2026-11-16T08:12:44.918Z");
});
