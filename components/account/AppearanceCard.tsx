"use client";

import { useRef } from "react";
import { SegmentedControl } from "@/components/ui/choice";
import { useAppColorMode } from "@/components/providers";
import { centreOf, type RevealPoint } from "@/lib/colorModeReveal";
import type { ColorMode } from "@/lib/colorMode";

/** Light or dark, revealed from the option that was pressed (pointer or keyboard). */
export function AppearanceCard() {
  const { mode, setColorModePreference } = useAppColorMode();
  const origin = useRef<RevealPoint | undefined>(undefined);
  return (
    <div
      onPointerDown={(event) => { origin.current = { x: event.clientX, y: event.clientY }; }}
      onKeyDown={(event) => { origin.current = event.target instanceof Element ? centreOf(event.target.getBoundingClientRect()) : undefined; }}
    >
      <SegmentedControl<ColorMode>
        ariaLabel="Colour mode"
        value={mode}
        onValueChange={(value) => {
          setColorModePreference(value, origin.current);
          origin.current = undefined;
        }}
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
    </div>
  );
}
