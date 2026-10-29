// Les prénoms supplémentaires de la source se trouvent entre le prénom usuel
// et le nom déjà connu. On exige les deux extrémités pour éviter de confondre
// deux personnes portant seulement le même nom de famille.
function words(name) {
    return (name ?? "").normalize("NFD").replace(/\p{M}/gu, "")
        .toLowerCase().replace(/[’']/g, "'").trim().split(/\s+/).filter(Boolean);
}

export function sameBishop(knownName, sourceName) {
    const known = words(knownName);
    const source = words(sourceName);
    if (known.length < 2 || source.length < known.length || known[0] !== source[0]) return false;
    return known.slice(1).every((word, index) => word === source[source.length - known.length + 1 + index]);
}
