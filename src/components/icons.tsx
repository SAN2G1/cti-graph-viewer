export const ICONS = {
  load: "M8 10V2M5 5l3-3 3 3M2 11v2.5A.5.5 0 0 0 2.5 14h11a.5.5 0 0 0 .5-.5V11",
  image: "M2 3.5h12v9H2zM2 11l3.5-3.5 3 3 2.5-2.5L14 11M6 6.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0",
  import: "M8 2v8M5 7l3 3 3-3M2 13.5h12",
  save: "M3 3h7.5L13 5.5V13H3V3zM5.5 3v3h4V3M5.5 9h5v4h-5z",
  help: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12M6.3 6a1.7 1.7 0 0 1 3.4.2c0 1.1-1.7 1.4-1.7 2.4M8 11.2h.01",
  grid: "M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z",
  flow: "M4 4l4 4-4 4M8 4l4 4-4 4",
  fit: "M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4",
  reset: "M13.5 8a5.5 5.5 0 1 1-1.7-4M13.5 2.5V6H10",
  legend: "M3 4h1.5M3 8h1.5M3 12h1.5M7 4h6M7 8h6M7 12h6",
  zoom: "M7 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M10.5 10.5 14 14",
  validation: "M8 2l6 11H2L8 2zM8 6v3M8 11.5h.01",
} as const;

export function Icon({ name, size = 14 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
