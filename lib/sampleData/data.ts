/**
 * The sample makerspace inventory (pure data). Costs are in major units of
 * the space currency; quantities are whole units. Two items (jumper wires
 * and solder wire) start at or below their reorder point so the low-stock
 * view has something to show.
 */
type LocationKind = "BUILDING" | "ROOM" | "AREA" | "CABINET" | "SHELF" | "BIN";

export const SAMPLE_LOCATIONS: Array<{ code: string; name: string; kind: LocationKind; parent: string | null }> = [
  { code: "MAIN", name: "Main building", kind: "BUILDING", parent: null },
  { code: "ELAB", name: "Electronics lab", kind: "ROOM", parent: "MAIN" },
  { code: "ELAB-SA", name: "Shelf A", kind: "SHELF", parent: "ELAB" },
  { code: "ELAB-SB", name: "Shelf B", kind: "SHELF", parent: "ELAB" },
  { code: "ELAB-B1", name: "Bin 1", kind: "BIN", parent: "ELAB-SA" },
  { code: "ELAB-B2", name: "Bin 2", kind: "BIN", parent: "ELAB-SA" },
  { code: "ELAB-B3", name: "Bin 3", kind: "BIN", parent: "ELAB-SB" },
  { code: "ELAB-B4", name: "Bin 4", kind: "BIN", parent: "ELAB-SB" },
  { code: "WS", name: "Workshop", kind: "ROOM", parent: "MAIN" },
  { code: "WS-TW", name: "Tool wall", kind: "AREA", parent: "WS" },
  { code: "WS-CAB", name: "Cabinet", kind: "CABINET", parent: "WS" },
];

export const SAMPLE_CATEGORIES = ["Hand tools", "Power tools", "Electronics", "Components", "3D printing", "Measuring", "Safety gear", "Consumables"] as const;

export const SAMPLE_UNITS = [
  { name: "Piece", symbol: "pcs" },
  { name: "Pack", symbol: "pack" },
  { name: "Spool", symbol: "spool" },
  { name: "Metre", symbol: "m" },
] as const;

type Category = (typeof SAMPLE_CATEGORIES)[number];
type UnitSymbol = (typeof SAMPLE_UNITS)[number]["symbol"];

export type SampleItem = {
  sku: string;
  name: string;
  category: Category;
  unit: UnitSymbol;
  cost: number;
  brand?: string;
  lendable?: boolean;
  consumable?: boolean;
  selfCheckout?: boolean;
  loanDays?: number;
  reorderPoint?: number;
  tags?: string[];
  /** Quantity items: units received at a location. */
  stock?: { location: string; quantity: number };
  /** Serialized items: physical units registered at a location, one serial each. */
  assets?: { location: string; serials: string[] };
};

export const SAMPLE_ITEMS: SampleItem[] = [
  { sku: "RES-KIT", name: "Resistor kit, 600 pieces", category: "Components", unit: "pack", cost: 450, consumable: true, reorderPoint: 2, tags: ["electronics"], stock: { location: "ELAB-B1", quantity: 6 } },
  { sku: "CAP-KIT", name: "Ceramic capacitor kit", category: "Components", unit: "pack", cost: 380, consumable: true, stock: { location: "ELAB-B1", quantity: 4 } },
  { sku: "LED-5MM", name: "5 mm LEDs, pack of 100", category: "Components", unit: "pack", cost: 120, consumable: true, reorderPoint: 3, stock: { location: "ELAB-B2", quantity: 10 } },
  { sku: "JUMPER-MM", name: "Jumper wires, male to male (40)", category: "Components", unit: "pack", cost: 90, consumable: true, reorderPoint: 5, stock: { location: "ELAB-B2", quantity: 2 } },
  { sku: "SERVO-SG90", name: "SG90 micro servo", category: "Components", unit: "pcs", cost: 110, consumable: true, stock: { location: "ELAB-B3", quantity: 15 } },
  { sku: "BREADBOARD", name: "Breadboard, 830 points", category: "Electronics", unit: "pcs", cost: 150, lendable: true, selfCheckout: true, reorderPoint: 4, stock: { location: "ELAB-SB", quantity: 12 } },
  { sku: "ARDUINO-UNO", name: "Arduino Uno R3", category: "Electronics", unit: "pcs", cost: 650, brand: "Arduino", lendable: true, loanDays: 14, reorderPoint: 3, tags: ["microcontroller"], stock: { location: "ELAB-SA", quantity: 8 } },
  { sku: "ESP32-DEVKIT", name: "ESP32 DevKit V1", category: "Electronics", unit: "pcs", cost: 450, brand: "Espressif", lendable: true, loanDays: 14, reorderPoint: 3, tags: ["microcontroller", "wifi"], stock: { location: "ELAB-SA", quantity: 10 } },
  { sku: "SOLDER-WIRE", name: "Solder wire 0.8 mm, 250 g", category: "Consumables", unit: "spool", cost: 780, consumable: true, reorderPoint: 2, stock: { location: "ELAB-B4", quantity: 1 } },
  { sku: "HOOKUP-WIRE", name: "Hook-up wire, 22 AWG", category: "Consumables", unit: "m", cost: 8, consumable: true, reorderPoint: 30, stock: { location: "ELAB-B4", quantity: 100 } },
  { sku: "SANDPAPER", name: "Sandpaper assortment", category: "Consumables", unit: "pack", cost: 220, consumable: true, stock: { location: "WS-CAB", quantity: 8 } },
  { sku: "PLA-BLACK", name: "PLA filament, black, 1 kg", category: "3D printing", unit: "spool", cost: 1100, consumable: true, reorderPoint: 2, stock: { location: "WS-CAB", quantity: 5 } },
  { sku: "PLA-WHITE", name: "PLA filament, white, 1 kg", category: "3D printing", unit: "spool", cost: 1100, consumable: true, reorderPoint: 2, stock: { location: "WS-CAB", quantity: 4 } },
  { sku: "PETG-CLEAR", name: "PETG filament, clear, 1 kg", category: "3D printing", unit: "spool", cost: 1350, consumable: true, stock: { location: "WS-CAB", quantity: 3 } },
  { sku: "GOGGLES", name: "Safety goggles", category: "Safety gear", unit: "pcs", cost: 180, lendable: true, selfCheckout: true, loanDays: 1, reorderPoint: 4, stock: { location: "WS-TW", quantity: 12 } },
  { sku: "EAR-DEFENDERS", name: "Ear defenders", category: "Safety gear", unit: "pcs", cost: 450, lendable: true, selfCheckout: true, loanDays: 1, stock: { location: "WS-TW", quantity: 6 } },
  { sku: "GLOVES-NITRILE", name: "Nitrile gloves, box of 100", category: "Safety gear", unit: "pack", cost: 400, consumable: true, reorderPoint: 1, stock: { location: "WS-CAB", quantity: 5 } },
  { sku: "SCREWDRIVER-SET", name: "Precision screwdriver set", category: "Hand tools", unit: "pcs", cost: 650, lendable: true, stock: { location: "WS-TW", quantity: 5 } },
  { sku: "PLIERS-NOSE", name: "Needle-nose pliers", category: "Hand tools", unit: "pcs", cost: 280, lendable: true, stock: { location: "WS-TW", quantity: 6 } },
  { sku: "WIRE-STRIPPER", name: "Wire stripper", category: "Hand tools", unit: "pcs", cost: 350, lendable: true, stock: { location: "ELAB-SB", quantity: 4 } },
  { sku: "SOLDER-STATION", name: "Soldering station, 60 W", category: "Electronics", unit: "pcs", cost: 4500, lendable: true, loanDays: 7, assets: { location: "ELAB-SA", serials: ["SS60-24011", "SS60-24012", "SS60-24013"] } },
  { sku: "MULTIMETER", name: "Digital multimeter", category: "Measuring", unit: "pcs", cost: 1800, lendable: true, loanDays: 7, assets: { location: "ELAB-SB", serials: ["DMM-1187", "DMM-1188", "DMM-1189", "DMM-1190"] } },
  { sku: "CALIPER", name: "Digital caliper, 150 mm", category: "Measuring", unit: "pcs", cost: 1500, lendable: true, assets: { location: "WS-TW", serials: ["CAL-0451", "CAL-0452"] } },
  { sku: "DRILL-CORDLESS", name: "Cordless drill, 18 V", category: "Power tools", unit: "pcs", cost: 6500, lendable: true, loanDays: 3, assets: { location: "WS-TW", serials: ["CD18-7730", "CD18-7731"] } },
  { sku: "JIGSAW", name: "Jigsaw, 500 W", category: "Power tools", unit: "pcs", cost: 4800, lendable: true, loanDays: 3, assets: { location: "WS-TW", serials: ["JS-30219"] } },
  { sku: "PRINTER-3D", name: "3D printer, 250 mm bed", category: "3D printing", unit: "pcs", cost: 65000, assets: { location: "WS", serials: ["P3D-0001", "P3D-0002"] } },
];

export const SAMPLE_KITS: Array<{ name: string; description: string; lines: Array<{ sku: string; quantity: number }> }> = [
  {
    name: "Arduino starter kit",
    description: "An Uno, a breadboard, jumper wires and LEDs for a first project.",
    lines: [{ sku: "ARDUINO-UNO", quantity: 1 }, { sku: "BREADBOARD", quantity: 1 }, { sku: "JUMPER-MM", quantity: 1 }, { sku: "LED-5MM", quantity: 1 }],
  },
  {
    name: "Soldering kit",
    description: "A soldering station with solder, a multimeter and goggles.",
    lines: [{ sku: "SOLDER-STATION", quantity: 1 }, { sku: "SOLDER-WIRE", quantity: 1 }, { sku: "MULTIMETER", quantity: 1 }, { sku: "GOGGLES", quantity: 1 }],
  },
];

export const SAMPLE_CONTAINER_COUNT = 4;
