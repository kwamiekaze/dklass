import { PACKAGES, getPackageById, type Package } from "@/data/packages";

/**
 * A proposal can carry several packages. They are stored in the existing
 * `schedule_proposals.package_id` text column as a comma-separated list of
 * package ids (a single id, as before, still reads as one package).
 */
export function parsePackageIds(raw?: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter((id) => !!getPackageById(id));
}
export function serializePackageIds(ids: string[]): string | null {
  const clean = ids.filter((id) => !!getPackageById(id));
  return clean.length ? clean.join(",") : null;
}
const priceValue = (p: Package) => parseFloat(p.price.replace(/[^0-9.]/g, "")) || 0;

/**
 * Resolve every package of a proposal. With no explicit selection, falls back
 * to the single auto-matched package.
 */
export function resolveProposalPackages(opts: {
  packageId?: string | null;
  totalHours: number;
  includesRoadTest: boolean;
}): { pkgs: Package[]; isExplicit: boolean; totalPrice: string } {
  const ids = parsePackageIds(opts.packageId);
  const pkgs = ids.length
    ? ids.map((id) => getPackageById(id)!)
    : [resolvePackageForProposal({ totalHours: opts.totalHours, includesRoadTest: opts.includesRoadTest })];
  const total = pkgs.reduce((sum, p) => sum + priceValue(p), 0);
  return { pkgs, isExplicit: ids.length > 0, totalPrice: `$${total.toFixed(2)}` };
}

/**
 * Resolve the package for a proposal, honoring an explicit admin selection
 * when present. Falls back to the existing auto-match logic otherwise.
 */
export function resolveProposalPackage(opts: {
  packageId?: string | null;
  totalHours: number;
  includesRoadTest: boolean;
}): { pkg: Package; isExplicit: boolean } {
  const first = parsePackageIds(opts.packageId)[0];
  const explicit = first ? getPackageById(first) : undefined;
  if (explicit) return { pkg: explicit, isExplicit: true };
  return {
    pkg: resolvePackageForProposal({
      totalHours: opts.totalHours,
      includesRoadTest: opts.includesRoadTest,
    }),
    isExplicit: false,
  };
}

/**
 * Resolve the best-fit package for a proposal based on total driving hours
 * and whether a road test is included.
 *
 * - If a road test is included, choose from the rdtest packages (1hr+rdtest / 2hr+rdtest)
 *   based on total driving hours (1hr for <=1, 2hr for >=2).
 * - Otherwise, choose the smallest standard package whose hour label covers
 *   the requested total. If nothing covers, use the largest available.
 */
export function resolvePackageForProposal(opts: {
  totalHours: number;
  includesRoadTest: boolean;
}): Package {
  const { totalHours, includesRoadTest } = opts;

  if (includesRoadTest) {
    const oneHr = PACKAGES.find(p => p.id === "1hr-rdtest")!;
    const twoHr = PACKAGES.find(p => p.id === "2hr-rdtest")!;
    return totalHours >= 2 ? twoHr : oneHr;
  }

  const standard = PACKAGES
    .filter(p => !p.id.includes("rdtest"))
    .map(p => ({ p, hrs: parseInt(p.id) }))
    .filter(x => Number.isFinite(x.hrs))
    .sort((a, b) => a.hrs - b.hrs);

  const covering = standard.find(x => x.hrs >= totalHours);
  return (covering ?? standard[standard.length - 1]).p;
}

export function sumProposalHours(items: Array<{ duration_minutes: number | string; session_type?: string }>): {
  totalHours: number;
  includesRoadTest: boolean;
} {
  let minutes = 0;
  let includesRoadTest = false;
  for (const it of items) {
    const d = typeof it.duration_minutes === "string" ? parseInt(it.duration_minutes) : it.duration_minutes;
    if (Number.isFinite(d)) minutes += d;
    if (it.session_type === "testing" || it.session_type === "Testing") includesRoadTest = true;
  }
  return { totalHours: minutes / 60, includesRoadTest };
}
