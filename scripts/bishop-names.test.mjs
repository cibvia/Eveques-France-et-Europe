import { test } from "node:test";
import assert from "node:assert/strict";
import { sameBishop } from "./bishop-names.mjs";

test("reconnaît les prénoms supplémentaires et conserve les noms composés", () => {
    assert.equal(sameBishop("Jean-Marc Micas", "Jean-Marc Joseph Micas"), true);
    assert.equal(sameBishop("Olivier de Germay", "Olivier Jacques Marie de Germay"), true);
    assert.equal(sameBishop("François d'Ornellas", "Francois Xavier d’Ornellas"), true);
    assert.equal(sameBishop("Laurent Ulrich", "Laurent Ulrich"), true);
});

test("ne confond pas des titulaires aux noms ou prénoms différents", () => {
    assert.equal(sameBishop("Jean Martin", "Pierre Jean Martin"), false);
    assert.equal(sameBishop("Jean Martin", "Jean Pierre Durand"), false);
    assert.equal(sameBishop("Jean de Martin", "Jean Martin"), false);
    assert.equal(sameBishop(null, "Jean Martin"), false);
});
