/** Small, repo-local work-item contracts.  These types deliberately keep
 * declared intent separate from facts produced by execution or a human. */
const PATCH_KEYS = new Set(["agent", "status", "blockers", "resume"]);
/**
 * Pure compare-and-update for exactly one item. The revision is a content
 * fingerprint, so raw edits are detected; unaddressed item references are
 * retained and acceptance/promotion/evidence fields cannot be patched.
 */
export function updateWorkItem(items, id, expectedRevision, patch) {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0)
        return { ok: false, reason: "not_found", items };
    const current = items[index];
    const currentRevision = workItemRevision(current);
    if (currentRevision !== expectedRevision) {
        return { ok: false, reason: "revision_mismatch", items, currentRevision };
    }
    for (const key of Object.keys(patch)) {
        if (!PATCH_KEYS.has(key)) {
            return {
                ok: false,
                reason: "invalid_patch",
                items,
                message: `Field '${key}' is not an ordinary work-item update field`,
            };
        }
    }
    if (patch.status && !["queued", "active", "review"].includes(patch.status)) {
        return { ok: false, reason: "invalid_patch", items, message: "Invalid status" };
    }
    const next = {
        ...current,
        ...patch,
        blockers: patch.blockers ? [...patch.blockers] : [...current.blockers],
    };
    const nextItems = items.slice();
    nextItems[index] = next;
    return { ok: true, items: nextItems, item: next, previousRevision: currentRevision };
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
/** Stable content fingerprint suitable for an expected-revision guard. */
export function workItemRevision(item) {
    let hash = 2166136261;
    for (const char of stable(item)) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}
export function recordReferenceKey(ref) {
    if (typeof ref === "string")
        return ref;
    if (ref.id)
        return ref.id;
    return [ref.path, ref.at, ref.pointer].filter(Boolean).join("#");
}
export function checkpointFor(item) {
    return item.checkpoints[item.checkpoints.length - 1];
}
/** Lightweight shape validation; external record contents are resolved later. */
export function validateWorkItem(item) {
    const errors = [];
    if (item.schemaVersion !== 1)
        errors.push(`${item.id}: unsupported schemaVersion`);
    if (!item.id)
        errors.push("item: missing id");
    if (!item.outcome)
        errors.push(`${item.id}: missing outcome`);
    if (!["calculation", "tick", "pcr"].includes(item.target?.kind)) {
        errors.push(`${item.id}: unknown target kind`);
        return errors;
    }
    const targetPrefix = item.target.kind === "calculation" ? "fn" : item.target.kind === "tick" ? "tick" : "pcr";
    if (!new RegExp(`^${targetPrefix}\\.[A-Za-z0-9_.-]+$`).test(item.target?.identity ?? "")) {
        errors.push(`${item.id}: ${item.target?.kind ?? "unknown"} target identity must use ${targetPrefix}.*`);
    }
    const requirementIds = new Set();
    for (const requirement of item.requirements) {
        if (requirementIds.has(requirement.id))
            errors.push(`${item.id}: duplicate requirement ${requirement.id}`);
        requirementIds.add(requirement.id);
    }
    for (const dependency of item.dependencies) {
        if (dependency.item === item.id)
            errors.push(`${item.id}: self dependency`);
    }
    for (const acceptance of item.acceptanceRefs) {
        if (!acceptance.human || !acceptance.subjectCommit || !acceptance.source) {
            errors.push(`${item.id}: acceptance reference is missing attribution or subject`);
        }
    }
    for (const promotion of item.promotionRefs) {
        if (!promotion.subjectCommit || !promotion.source || !promotion.destination) {
            errors.push(`${item.id}: promotion reference is incomplete`);
        }
    }
    return errors;
}
