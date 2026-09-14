export function definePcr(id, ticks) {
    if (!id.trim())
        throw new Error("PCR identity cannot be empty");
    const declarations = ticks.map((tick) => (typeof tick === "string" ? { id: tick } : tick));
    const ids = new Set();
    declarations.forEach((tick) => {
        if (!tick.id.trim())
            throw new Error("PCR Tick identity cannot be empty");
        if (ids.has(tick.id))
            throw new Error(`Duplicate PCR Tick identity: ${tick.id}`);
        ids.add(tick.id);
    });
    return { id, ticks: declarations };
}
function sameIds(expected, actual) {
    return expected.length === actual.length && expected.every((id, index) => id === actual[index]);
}
/**
 * Compose a PCR from a declaration and an actual PQL run. Static declarations
 * cannot manufacture testimony: every Tick and materialization comes from the
 * run result, and a missing/extra/reordered Tick is rejected.
 */
export function composePcr(definition, run) {
    const expected = definition.ticks.map((tick) => tick.id);
    const actual = run.ticks.map((tick) => tick.id);
    if (!sameIds(expected, actual)) {
        throw new Error(`PCR Tick identities do not match declaration: expected [${expected.join(", ")}] but got [${actual.join(", ")}]`);
    }
    const materializations = run.ticks.flatMap((tick) => tick.materializations.map((materialization) => ({
        tickId: tick.id,
        address: materialization.address,
        value: materialization.value,
    })));
    return {
        id: definition.id,
        declaredTicks: [...definition.ticks],
        ticks: [...run.ticks],
        testimony: {
            status: run.status === "completed" ? "executed" : "failed",
            ticks: [...run.ticks],
            reads: [...run.telemetry.reads],
            writes: [...run.telemetry.writes],
            invocations: [...run.telemetry.invocations],
        },
        materializations,
        pxc: run.pxc,
    };
}
