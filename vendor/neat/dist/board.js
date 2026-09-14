import { checkpointFor, recordReferenceKey, validateWorkItem, } from "./work-items.js";
import { calculationId, createPxC, readPart, registerCalculation, } from "./pxc.js";
import { runPql } from "./pql.js";
import { composePcr, definePcr } from "./pcr.js";
/** The exact bounded calculation identities used by the retained board run. */
export const BOARD_CALCULATIONS = {
    assess: "fn.neat.assess",
    dependencies: "fn.neat.dependencies",
    view: "fn.neat.view",
};
/** Existing PQL composition shape; the core PxC/PQL runner owns execution. */
export const BOARD_PQL_COMPOSITION = {
    PrincipleComponentRender: "NeatBoard",
    Ticks: [
        {
            name: "Assess",
            Calculations: [
                {
                    call: BOARD_CALCULATIONS.assess,
                    with: { items: "px.neat.items", facts: "px.neat.facts" },
                    into: "px.neat.assessments",
                },
            ],
        },
        {
            name: "Dependencies",
            Calculations: [
                {
                    call: BOARD_CALCULATIONS.dependencies,
                    with: { items: "px.neat.items", assessments: "px.neat.assessments" },
                    into: "px.neat.graph",
                },
            ],
        },
        {
            name: "View",
            Calculations: [
                {
                    call: BOARD_CALCULATIONS.view,
                    with: { items: "px.neat.items", assessments: "px.neat.assessments", graph: "px.neat.graph" },
                    into: "px.neat.view",
                },
            ],
        },
    ],
};
export function registerBoardCalculations(target) {
    const definitions = [
        {
            id: calculationId(BOARD_CALCULATIONS.assess),
            run: (input) => {
                const value = input;
                return assessWorkItems(value.items, value.facts ?? {});
            },
        },
        {
            id: calculationId(BOARD_CALCULATIONS.dependencies),
            run: (input) => {
                const value = input;
                return resolveDependencies(value.items, value.assessments);
            },
        },
        {
            id: calculationId(BOARD_CALCULATIONS.view),
            run: (input) => {
                const value = input;
                return composeBoardView(value.items, value.assessments, value.graph);
            },
        },
    ];
    if ("calculations" in target) {
        let current = target;
        for (const definition of definitions)
            current = registerCalculation(current, definition);
        return current;
    }
    const registry = target;
    for (const definition of definitions)
        registry.registerCalculation(String(definition.id), (input) => definition.run(input, {
            read: () => { throw new Error("The mutable registry adapter has no Part reads"); },
            write: () => { throw new Error("The mutable registry adapter has no Part writes"); },
            invoke: () => { throw new Error("The mutable registry adapter has no nested invocation"); },
        }));
}
function refMatches(ref, id) {
    return Boolean(ref && recordReferenceKey(ref) === id);
}
function verificationFor(item, checkpoint, facts) {
    if (!checkpoint) {
        return item.requirements.map((requirement) => ({ id: requirement.id, result: "unknown", evidence: [] }));
    }
    const records = (facts.verificationRecords ?? []).filter((record) => facts.allowSynthetic || !record.synthetic);
    const declaredIds = new Set([
        ...Object.values(checkpoint.verificationRefs).map(recordReferenceKey),
        ...(checkpoint.executionRefs ?? []).map(recordReferenceKey),
        ...(checkpoint.inspectionRefs ?? []).map(recordReferenceKey),
    ]);
    const matchingRecords = records.filter((record) => declaredIds.has(record.id) &&
        record.itemId === item.id &&
        record.checkpointId === checkpoint.id &&
        record.subjectCommit === checkpoint.commit &&
        record.target.kind === item.target.kind &&
        record.target.identity === item.target.identity &&
        (item.target.name === undefined || record.target.name === item.target.name) &&
        (item.target.composition === undefined || record.target.composition === item.target.composition));
    return item.requirements.map((requirement) => {
        const declared = checkpoint.verificationRefs[requirement.id];
        const refs = matchingRecords.filter((record) => refMatches(declared, record.id));
        const evidence = refs.map((record) => record.id).sort();
        const hasExecution = matchingRecords.some((record) => record.recordKind !== "inspection");
        const hasInspection = matchingRecords.some((record) => record.recordKind === "inspection");
        if (!hasExecution || !hasInspection)
            return { id: requirement.id, result: "unknown", evidence };
        if (refs.some((record) => record.requirementResults[requirement.id] === "failed")) {
            return { id: requirement.id, result: "failed", evidence };
        }
        if (refs.some((record) => record.requirementResults[requirement.id] === "passed")) {
            return { id: requirement.id, result: "passed", evidence };
        }
        return { id: requirement.id, result: "unknown", evidence };
    });
}
function coversRequirements(scope, requirements) {
    return scope === "all" || (scope.length > 0 && scope.every((id) => requirements.some((requirement) => requirement.id === id)));
}
function acceptanceFor(item, checkpoint, requirements, facts) {
    if (!checkpoint)
        return false;
    const refs = (facts.acceptanceRecords ?? []).filter((record) => facts.allowSynthetic || !record.synthetic);
    return item.acceptanceRefs.some((declared) => {
        const matching = refs.filter((record) => record.id === recordReferenceKey(declared.ref) &&
            record.itemId === item.id &&
            record.subjectCommit === checkpoint.commit &&
            record.source &&
            recordReferenceKey(record.source) === recordReferenceKey(declared.source) &&
            record.human === declared.human &&
            coversRequirements(record.requirementScope, requirements));
        if (matching.some((record) => record.disposition === "rejected"))
            return false;
        return matching.some((record) => record.disposition === "accepted");
    });
}
function promotionFor(item, checkpoint, facts) {
    if (!checkpoint)
        return false;
    const refs = (facts.promotionRecords ?? []).filter((record) => facts.allowSynthetic || !record.synthetic);
    return item.promotionRefs.some((declared) => refs.some((record) => record.id === recordReferenceKey(declared.ref) &&
        record.itemId === item.id &&
        record.subjectCommit === checkpoint.commit &&
        record.source === declared.source &&
        record.destination === declared.destination));
}
function surfaceKeys(item) {
    return [item.location.component, item.location.experiment].filter((value) => Boolean(value));
}
function hasAvailableSurface(item, facts) {
    if (!facts.availableSurfaces)
        return "unknown";
    const available = new Set(facts.availableSurfaces);
    return surfaceKeys(item).some((surface) => available.has(surface)) ? "available" : "unavailable";
}
function baseBucket(item, verified, accepted, promoted) {
    if (promoted)
        return "promoted";
    if (accepted)
        return "accepted";
    if (verified)
        return "ready-for-review";
    if (item.status === "active")
        return "active";
    return "queued";
}
/** First PxC calculation: assess only evidence explicitly named by an item. */
export function assessWorkItems(items, facts = {}) {
    return [...items]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((item) => {
        const shapeErrors = validateWorkItem(item);
        const checkpoint = checkpointFor(item);
        const requirements = verificationFor(item, checkpoint, facts);
        const verified = Boolean(checkpoint) && requirements.every((requirement) => requirement.result === "passed");
        const accepted = acceptanceFor(item, checkpoint, requirements, facts);
        const promoted = promotionFor(item, checkpoint, facts);
        const available = hasAvailableSurface(item, facts);
        const blockers = [...item.blockers];
        if (shapeErrors.length)
            blockers.push(...shapeErrors);
        if (available === "unavailable")
            blockers.push("implementation/material surface unavailable");
        if (available === "unknown")
            blockers.push("implementation/material surface availability unknown");
        const synthetic = (facts.verificationRecords ?? []).some((record) => record.itemId === item.id && record.synthetic) ||
            (facts.acceptanceRecords ?? []).some((record) => record.itemId === item.id && record.synthetic) ||
            (facts.promotionRecords ?? []).some((record) => record.itemId === item.id && record.synthetic);
        return {
            itemId: item.id,
            target: item.target,
            activity: item.status,
            checkpointId: checkpoint?.id,
            subjectCommit: checkpoint?.commit,
            requirements,
            executionRefs: (checkpoint?.executionRefs ?? []).map(recordReferenceKey).sort(),
            inspectionRefs: (checkpoint?.inspectionRefs ?? []).map(recordReferenceKey).sort(),
            verified,
            accepted,
            promoted,
            available,
            dependencySatisfied: true,
            blockers: [...new Set(blockers)],
            bucket: baseBucket(item, verified, accepted, promoted),
            synthetic,
        };
    });
}
function detectCycles(items) {
    const ids = new Set(items.map((item) => item.id));
    const visiting = new Set();
    const visited = new Set();
    const stack = [];
    const cycles = [];
    const visit = (id) => {
        if (visiting.has(id)) {
            const start = stack.indexOf(id);
            cycles.push([...stack.slice(start), id]);
            return;
        }
        if (visited.has(id) || !ids.has(id))
            return;
        visiting.add(id);
        stack.push(id);
        const item = items.find((candidate) => candidate.id === id);
        for (const dependency of item?.dependencies ?? [])
            visit(dependency.item);
        stack.pop();
        visiting.delete(id);
        visited.add(id);
    };
    for (const item of [...items].sort((a, b) => a.id.localeCompare(b.id)))
        visit(item.id);
    return cycles;
}
/** Second PxC calculation: resolve fixed dependency predicates and cycles. */
export function resolveDependencies(items, assessments) {
    const byId = new Map(assessments.map((assessment) => [assessment.itemId, assessment]));
    const known = new Set(items.map((item) => item.id));
    const missingItems = new Set();
    const edges = [];
    for (const item of [...items].sort((a, b) => a.id.localeCompare(b.id))) {
        for (const dependency of item.dependencies) {
            const prerequisite = byId.get(dependency.item);
            if (!known.has(dependency.item))
                missingItems.add(dependency.item);
            const satisfied = Boolean(prerequisite) &&
                prerequisite.available === "available" &&
                (dependency.requires === "verified"
                    ? prerequisite.verified
                    : dependency.requires === "accepted"
                        ? prerequisite.accepted
                        : prerequisite.promoted);
            edges.push({
                item: item.id,
                prerequisite: dependency.item,
                requires: dependency.requires,
                satisfied,
                ...(satisfied
                    ? {}
                    : {
                        reason: !known.has(dependency.item)
                            ? "missing item"
                            : prerequisite.available !== "available"
                                ? `${dependency.item} implementation/material surface is ${prerequisite.available}`
                                : `${dependency.item} is not ${dependency.requires}`,
                    }),
            });
        }
    }
    return { edges, cycles: detectCycles(items), missingItems: [...missingItems].sort() };
}
/** Third PxC calculation: retain one view model for both textual renderers. */
export function composeBoardView(items, assessments, graph) {
    const blocked = new Set();
    for (const assessment of assessments)
        if (assessment.blockers.length)
            blocked.add(assessment.itemId);
    for (const edge of graph.edges)
        if (!edge.satisfied)
            blocked.add(edge.item);
    for (const cycle of graph.cycles)
        for (const id of cycle)
            blocked.add(id);
    const missing = new Set(graph.missingItems);
    const byId = new Map(assessments.map((assessment) => [assessment.itemId, assessment]));
    return [...items]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((item) => {
        const prior = byId.get(item.id);
        const reasons = [...prior.blockers];
        for (const edge of graph.edges.filter((candidate) => candidate.item === item.id && !candidate.satisfied)) {
            reasons.push(edge.reason ?? `${edge.prerequisite} is not ${edge.requires}`);
        }
        if (graph.cycles.some((cycle) => cycle.includes(item.id)))
            reasons.push("dependency cycle");
        if (item.dependencies.some((dependency) => missing.has(dependency.item)))
            reasons.push("missing dependency item");
        const isBlocked = blocked.has(item.id);
        return {
            ...prior,
            dependencySatisfied: !item.dependencies.some((dependency) => {
                const edge = graph.edges.find((candidate) => candidate.item === item.id && candidate.prerequisite === dependency.item && candidate.requires === dependency.requires);
                return !edge?.satisfied;
            }),
            blockers: [...new Set(reasons)],
            bucket: isBlocked ? "blocked" : prior.bucket,
        };
    });
}
function stable(value) {
    if (Array.isArray(value))
        return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
function fingerprint(value) {
    let hash = 2166136261;
    for (const char of stable(value)) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}
function cardLabel(item, assessment) {
    const synthetic = assessment.synthetic ? " · synthetic fixture" : "";
    const agent = item.agent ? ` · agent=${item.agent}` : "";
    return `${item.id} · ${item.outcome} · ${assessment.bucket} · activity=${item.status}${agent} · target=${item.target.kind}:${item.target.identity} · execution=[${assessment.executionRefs.join(",")}] · inspection=[${assessment.inspectionRefs.join(",")}]${synthetic}`;
}
export function renderBoardMarkdown(items, assessments, graph) {
    const byId = new Map(items.map((item) => [item.id, item]));
    const buckets = ["blocked", "active", "ready-for-review", "accepted", "promoted", "queued"];
    const byBucket = new Map();
    for (const bucket of buckets)
        byBucket.set(bucket, []);
    for (const assessment of assessments)
        byBucket.get(assessment.bucket).push(assessment.itemId);
    const lines = ["# neat board", "", "Generated from one retained analysis; fixture evidence is explicitly synthetic.", ""];
    lines.push("| Blocked | Active | Ready for review | Accepted | Promoted | Queued |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    const rows = Math.max(...buckets.map((bucket) => byBucket.get(bucket).length), 0);
    for (let row = 0; row < rows; row++) {
        lines.push(`| ${buckets
            .map((bucket) => {
            const id = byBucket.get(bucket)[row];
            if (!id)
                return "";
            const assessment = assessments.find((candidate) => candidate.itemId === id);
            const reasons = assessment.blockers.length ? ` — ${assessment.blockers.join("; ")}` : "";
            return `${cardLabel(byId.get(id), assessment)}${reasons}`;
        })
            .join(" | ")} |`);
    }
    lines.push("", "## Dependency edges", "", "| Item | Requires | Prerequisite | Result |", "| --- | --- | --- | --- |");
    for (const edge of graph.edges)
        lines.push(`| ${edge.item} | ${edge.requires} | ${edge.prerequisite} | ${edge.satisfied ? "satisfied" : "blocked"} |`);
    return lines.join("\n");
}
export function renderDependencyMermaid(items, assessments, graph, facts = {}) {
    const byId = new Map(items.map((item) => [item.id, item]));
    const status = new Map(assessments.map((assessment) => [assessment.itemId, assessment]));
    const nodeId = (id) => `item_${id.replace(/[^A-Za-z0-9_]/g, "_")}`;
    const lines = ["flowchart TD"];
    for (const item of [...items].sort((a, b) => a.id.localeCompare(b.id))) {
        const assessment = status.get(item.id);
        lines.push(`  ${nodeId(item.id)}["${item.id} · ${assessment.bucket}"]`);
    }
    for (const edge of graph.edges) {
        if (byId.has(edge.prerequisite)) {
            lines.push(`  ${nodeId(edge.prerequisite)} -->|${edge.requires}${edge.satisfied ? "" : " · blocked"}| ${nodeId(edge.item)}`);
        }
    }
    const fanout = calculationFanout(items, facts);
    for (const [calculation, ticks] of Object.entries(fanout)) {
        if (ticks.length < 2)
            continue;
        const calcNode = `calc_${calculation.replace(/[^A-Za-z0-9_]/g, "_")}`;
        lines.push(`  ${calcNode}{"${calculation} · shared calculation"}`);
        for (const tick of ticks)
            lines.push(`  ${calcNode} -. affects .-> ${nodeId(tick)}`);
    }
    return lines.join("\n");
}
export function calculationFanout(items, facts = {}) {
    const fanout = {};
    for (const item of items) {
        if (item.target.kind !== "tick")
            continue;
        for (const composition of facts.compositions ?? []) {
            if (item.target.composition &&
                item.target.composition !== composition.identity &&
                item.target.composition !== composition.pql.PrincipleComponentRender)
                continue;
            const tick = composition.pql.Ticks.find((candidate) => candidate.name === item.target.identity || `tick.${candidate.name}` === item.target.identity);
            for (const calculationStep of tick?.Calculations ?? []) {
                const calculation = String(calculationStep.call);
                if (!fanout[calculation])
                    fanout[calculation] = [];
                fanout[calculation].push(item.id);
            }
        }
    }
    for (const calculation of Object.keys(fanout))
        fanout[calculation] = [...new Set(fanout[calculation])].sort();
    return Object.fromEntries(Object.entries(fanout).sort(([a], [b]) => a.localeCompare(b)));
}
export function materializeBoard(input) {
    const facts = input.facts ?? {};
    const seed = createPxC({ "px.neat.items": input.items, "px.neat.facts": facts });
    const registered = registerBoardCalculations(seed);
    const run = runPql(registered, BOARD_PQL_COMPOSITION);
    if (run.status !== "completed")
        throw new Error("Neat board PQL execution failed", { cause: run.error });
    const assessments = readPart(run.pxc, "px.neat.assessments").value;
    const graph = readPart(run.pxc, "px.neat.graph").value;
    const view = readPart(run.pxc, "px.neat.view").value;
    const pcr = composePcr(definePcr("pcr.neat.board", BOARD_PQL_COMPOSITION.Ticks.map((tick) => tick.name)), run);
    const markdown = renderBoardMarkdown(input.items, view, graph);
    const mermaid = renderDependencyMermaid(input.items, view, graph, facts);
    return {
        assessments: view,
        graph,
        calculationFanout: calculationFanout(input.items, facts),
        inputFingerprint: fingerprint({ items: input.items, facts }),
        markdown,
        mermaid,
        analysisRun: run,
        analysisPcr: pcr,
    };
}
