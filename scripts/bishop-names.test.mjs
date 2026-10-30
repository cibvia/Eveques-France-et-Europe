import { test } from "node:test";
import assert from "node:assert/strict";
import { sameBishop } from "./bishop-names.mjs";

test("reconnaît les prénoms supplémentaires et conserve les noms composés", () => {
    assert.equal(sameBishop("Jean-Marc Micas", "Jean-Marc Joseph Micas"), true);
    assert.equal(sameBishop("Olivier de Germay", "Olivier Jacques Marie de Germay"), true);
    assert.equal(sameBishop("François d'Ornellas", "Francois Xavier d’Ornellas"), true);
    assert.equal(sameBishop("Laurent Ulrich", "Laurent Ulrich"), true);
    assert.equal(sameBishop("Luc Crepy", "Lucien (Luc) Jacques Marie Crepy"), true);
    assert.equal(sameBishop("Guy de Kerimel", "Guy André Marie de Kerimel de Kerveno", "de Kerimel de Kerveno"), true);
    assert.equal(sameBishop("Antoine de Romanet", "Antoine Pierre Louis Marie de Romanet de Beaune", "de Romanet de Beaune"), true);
    const alias = { nomUsuel: "Éric de Moulins-Beaufort", nomSource: "Éric Marie de Moulins d’Amieu de Beaufort" };
    assert.equal(sameBishop(alias.nomUsuel, alias.nomSource, "de Moulins d’Amieu de Beaufort", alias), true);
    assert.equal(sameBishop(alias.nomUsuel, "Éric de Moulins d’Amieu de Beaufort", "de Moulins d’Amieu de Beaufort", alias), false);
    const verdun = { nomUsuel: "Joseph de Metz-Noblat", nomSource: "Joseph-Marie-Edouard de Metz-Noblat" };
    assert.equal(sameBishop(verdun.nomUsuel, verdun.nomSource, "de Metz-Noblat", verdun), true);
});

test("ne confond pas des titulaires aux noms ou prénoms différents", () => {
    assert.equal(sameBishop("Jean Martin", "Pierre Jean Martin"), false);
    assert.equal(sameBishop("Jean Martin", "Jean Pierre Durand"), false);
    assert.equal(sameBishop("Jean de Martin", "Jean Martin"), false);
    assert.equal(sameBishop(null, "Jean Martin"), false);
});
