// Generated from app/s/[spaceSlug]/transfers/new/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { localStock, otherSpaces, sharedStock } from "@/lib/desk/transferOptions";
import { requireSpace } from "@/lib/permissions";
const MODES = ["internal", "push", "pull"] as const;
export async function loadNewTransferPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/transfers/new">) {
const { spaceSlug } = await params;
const { space } = await requireSpace(spaceSlug, "STAFF");
const query = await searchParams;
const initialMode = MODES.find((value) => value === query.mode) ?? "internal";
const from = typeof query.from === "string" ? query.from.slice(0, 64) : null;
const stock = await localStock(space.id);
const spaces = await otherSpaces(space.id);
const shared = initialMode === "pull" && from ? await sharedStock(from, space.id) : null;
const slug = space.slug;
const locations = stock.locations;
const localItems = stock.items.map((item) => ({ id: item.id, name: item.name, sku: item.sku, available: item.available }));
const pushTargets = spaces.pushTargets;
const pullSources = spaces.pullSources;
return viewDto({ initialMode, shared, slug, locations, localItems, pushTargets, pullSources } as const);
}
