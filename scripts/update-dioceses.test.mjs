import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDioceseInfo, frenchTitle } from "./update-dioceses.mjs";

test("traduit le titre des nouveaux titulaires", () => {
    assert.equal(frenchTitle("Diocèse de Verdun", "Bishop"), "Évêque de Verdun");
    assert.equal(frenchTitle("Archidiocèse de Poitiers", "Archbishop"), "Archevêque de Poitiers");
    assert.equal(frenchTitle("Éparchie ukrainienne de Paris", "Bishop"), "Éparque de l’éparchie ukrainienne de Paris");
});

test("extrait le titulaire et son nom usuel sans confondre les auxiliaires et les congrégations", () => {
    const html = `<h3>Bishop(s)</h3><ul>
      <li><a href="/bishop/baux.html">Jean <b>Auxiliaire</b></a>, Auxiliary Bishop</li>
      <li><a href="/bishop/bnahm.html">Jean-Yves André Michel <b>Nahmias</b></a>, P.S.S., Bishop<script>garbage()</script></li>
      </ul><h3>General Information</h3>
      <h2>Past and Present Ordinaries</h2><ul><li>Jean-Yves André Michel Nahmias (9 Aug 2012 Appointed - )</li></ul>`;
    const info = extractDioceseInfo(html);
    assert.equal(info.parseStatus, "ok");
    assert.deepEqual(info.eveque, { nom: "Jean-Yves André Michel Nahmias", nomUsuel: "Jean-Yves Nahmias", nomFamille: "Nahmias", titre: "Bishop", depuis: "2012-08-09" });
});

test("préserve les noms de famille composés et détecte les vacances explicites", () => {
    const info = extractDioceseInfo(`<h3>Bishop(s)</h3><ul><li><a href="/bishop/bx.html">Olivier Jacques Marie <b>de Germay</b></a>, Archbishop</li></ul>`);
    assert.equal(info.eveque.nomUsuel, "Olivier de Germay");
    const lucon = extractDioceseInfo(`<h3>Bishop(s)</h3><ul><li><a href="/bishop/bdine.html">Renauld Marie François Dupont <b>de Dinechin</b></a>, Bishop</li></ul>`);
    assert.equal(lucon.eveque.nomUsuel, "Renauld de Dinechin");
    assert.equal(extractDioceseInfo(`<h3>Bishop(s)</h3><ul><li>See is Vacant</li></ul>`).parseStatus, "vacant");
    assert.equal(extractDioceseInfo(`<h3>Bishop(s)</h3><ul><li><a href="/country/dfr3.html">Vacant</a></li></ul>`).parseStatus, "vacant");
    assert.equal(extractDioceseInfo(`<h3>Bishop(s)</h3><ul><li>Autre format</li></ul>`).parseStatus, "parse_failed");
});
