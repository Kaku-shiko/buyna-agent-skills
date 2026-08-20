import { create } from "zustand";
import {
  initialBookings,
  initialClipCandidates,
  initialOrders,
  initialProducts,
  initialServices,
  type Booking,
  type ClipCandidate,
  type Order,
  type Product,
  type Service,
} from "./mock-data";

// "HH:MM:SS-HH:MM:SS" → "MM:SS" duration
function computeDuration(range: string): string {
  const m = range.match(/(\d{1,2}):(\d{2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return "00:30";
  const a = +m[1] * 3600 + +m[2] * 60 + +m[3];
  const b = +m[4] * 3600 + +m[5] * 60 + +m[6];
  const d = Math.max(1, b - a);
  const mm = String(Math.floor(d / 60)).padStart(2, "0");
  const ss = String(d % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

type State = {
  products: Product[];
  services: Service[];
  orders: Order[];
  bookings: Booking[];
  clips: ClipCandidate[];
  addOrder: (o: Order) => void;
  addBooking: (b: Booking) => void;
  publishClip: (id: string) => void;
  addProduct: (p: Product) => void;
  addService: (s: Service) => void;
  addClips: (cs: ClipCandidate[]) => void;
  resetClips: () => void;
};

export const useStore = create<State>((set) => ({
  products: initialProducts,
  services: initialServices,
  orders: initialOrders,
  bookings: initialBookings,
  clips: initialClipCandidates,
  addOrder: (o) => set((s) => ({ orders: [o, ...s.orders] })),
  addBooking: (b) => set((s) => ({ bookings: [b, ...s.bookings] })),
  publishClip: (id) =>
    set((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, status: "published" as const } : c)),
      products: s.products.map((p) => {
        const clip = s.clips.find((c) => c.id === id);
        if (clip && clip.productId === p.id) {
          const dur = computeDuration(clip.range);
          return {
            ...p,
            tags: p.tags.includes("有直播讲解") ? p.tags : [...p.tags, "有直播讲解"],
            clip: {
              title: clip.quote
                ? `${clip.type.split(" ")[0]}："${clip.quote}"`
                : `${clip.type}：${p.name}`,
              duration: dur,
              note: clip.sourcePlatform ? `来自${clip.sourcePlatform}` : "来自最新直播回放",
              published: true,
              range: clip.range,
              sourceUrl: clip.sourceUrl,
              sourcePlatform: clip.sourcePlatform,
              quote: clip.quote,
            },
          };
        }
        return p;
      }),
    })),
  addProduct: (p) => set((s) => ({ products: [p, ...s.products] })),
  addService: (sv) => set((s) => ({ services: [sv, ...s.services] })),
  addClips: (cs) => set((s) => ({ clips: [...cs, ...s.clips] })),
  resetClips: () => set({ clips: [] }),
}));
