import assert from 'node:assert/strict';
import { resolverBairroCatalogo } from '../_utils/bairroCatalogo.js';

const cidade = 'juiz-de-fora-mg';

assert.equal(resolverBairroCatalogo('Centro', cidade), 'centro');
assert.equal(resolverBairroCatalogo('BORBOLETA', cidade), 'borboleta');
assert.equal(resolverBairroCatalogo('Santa Terezinha', cidade), 'santa-terezinha');
assert.equal(resolverBairroCatalogo('Apartamento no bairro Francisco Bernardino', cidade), 'francisco-bernardino');
assert.equal(resolverBairroCatalogo('Centro', 'cidade-inexistente-mg'), '');
assert.equal(resolverBairroCatalogo('Bairro não catalogado', cidade), '');

console.log('Testes isolados de bairros: OK');