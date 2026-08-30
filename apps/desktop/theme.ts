export const C = {
  canvas: "#171717",
  sidebar: "#141414",
  panel: "#1C1C1C",
  raised: "#242424",
  overlay: "#303030",
  border: "#343434",
  text: "#E8E8E8",
  secondary: "#A8A8A8",
  tertiary: "#737373",
  accent: "#E2795B",
  accentSoft: "#E2795B22",
  danger: "#EF6464",
} as const

export const FONT = typeof window === "undefined" ? "Helvetica" : "IBM Plex Sans"
