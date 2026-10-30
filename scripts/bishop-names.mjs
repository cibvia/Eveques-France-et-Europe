// Les prénoms supplémentaires de la source se trouvent entre le prénom usuel
// et le nom déjà connu. On exige les deux extrémités pour éviter de confondre
// deux personnes portant seulement le même nom de famille.
function words(name) {
    return (name ?? "").normalize("NFD").replace(/\p{M}/gu, "")
        .toLowerCase().replace(/[’']/g, "'").replace(/[()]/g, " ").trim().split(/\s+/).filter(Boolean);
}

export function sameBishop(knownName, sourceName, sourceSurname, alias) {
    const known = words(knownName);
    const source = words(sourceName);
    if (known.length < 2 || source.length < known.length) return false;
    if (alias && words(alias.nomUsuel).join(" ") === known.join(" ") &&
        words(alias.nomSource).join(" ") === source.join(" ")) return true;
    const usual = (sourceName ?? "").match(/\(([^()]+)\)/)?.[1];
    if (known[0] !== source[0] && words(usual)[0] !== known[0]) return false;
    if (known.slice(1).every((word, index) => word === source[source.length - known.length + 1 + index])) return true;
    const surname = words(sourceSurname);
    return surname.length >= known.length - 1 && known.slice(1).every((word, index) => surname[index] === word);
}
