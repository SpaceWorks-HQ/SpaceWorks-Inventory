"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { scanCountAssetAction } from "@/app/actions/counts";
import { LocationPicker, type LocationOption } from "@/components/desk/LocationPicker";
import { ScanField } from "@/components/desk/ScanField";
import { Card, CardHeader } from "@/components/ui/display";

/** Serialized items are counted by scanning each asset tag at the shelf being counted. */
export function ScanCountCard({ slug, countId, locations }: { slug: string; countId: string; locations: LocationOption[] }) {
  const router = useRouter();
  const [locationId, setLocationId] = useState("");
  return (
    <Card as="section" aria-label="Scan asset tags">
      <CardHeader title="Scan asset tags" description="Choose the shelf you're standing at, then scan every tagged tool on it." />
      <div className="flex flex-col gap-4">
        <LocationPicker locations={locations} value={locationId} onChange={setLocationId} label="Current shelf" />
        <ScanField
          label="Asset tag code"
          disabled={!locationId}
          helper={locationId ? "Each tag counts once; scanning it again at another shelf moves it there." : "Choose the shelf first."}
          onCode={async (code) => {
            const result = await scanCountAssetAction(slug, { countId, code, locationId });
            if (!result.ok) return { tone: "warning", text: result.error };
            router.refresh();
            return { tone: "success", text: `Counted ${result.data?.label ?? code}.` };
          }}
        />
      </div>
    </Card>
  );
}
