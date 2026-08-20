import type { Product, Service } from "./mock-data";

// ---------- shop ----------

const SHOP_CATEGORIES: { key: string; label: string; aliases: string[] }[] = [
  { key: "watch", label: "手表", aliases: ["手表", "腕表", "watch"] },
  { key: "vase", label: "花瓶", aliases: ["花瓶", "vase"] },
  { key: "bag", label: "包", aliases: ["包", "手袋", "背包", "bag"] },
  { key: "camera", label: "相机", aliases: ["相机", "胶片机", "camera"] },
  { key: "headphones", label: "耳机", aliases: ["耳机", "耳麦", "headphones"] },
  { key: "tea", label: "茶具", aliases: ["茶具", "茶杯", "茶壶"] },
  { key: "perfume", label: "香水", aliases: ["香水", "perfume"] },
  { key: "jewelry", label: "首饰", aliases: ["首饰", "项链", "戒指", "耳环"] },
  { key: "skincare", label: "护肤品", aliases: ["护肤", "面霜", "化妆品"] },
  { key: "snack", label: "零食", aliases: ["零食", "点心", "和果子", "巧克力"] },
  { key: "sake", label: "清酒", aliases: ["清酒", "酒", "威士忌"] },
  { key: "craft", label: "日本工艺品", aliases: ["工艺品", "手作", "漆器", "陶瓷"] },
];

const PURPOSES = ["送礼", "自用", "收藏", "纪念", "婚礼", "生日"];

export type ShopIntent = {
  category: string;
  categoryKey: string;
  purpose?: string;
  budget?: number;
  rareOnly: boolean;
  rawKeyword: string;
};

export function parseShopQuery(text: string): ShopIntent {
  const t = text.toLowerCase();
  let cat = SHOP_CATEGORIES.find((c) =>
    c.aliases.some((a) => text.includes(a) || t.includes(a.toLowerCase())),
  );
  // fallback: pick the noun right after 买/想要/找
  let rawKeyword = cat?.label ?? "";
  if (!cat) {
    const m = text.match(/(?:买|想要|找|看看|来个|来一个|来款)\s*([^\s，。,；;！!?？的]{1,8})/);
    if (m) {
      rawKeyword = m[1];
      cat = { key: rawKeyword, label: rawKeyword, aliases: [rawKeyword] };
    } else {
      cat = SHOP_CATEGORIES[0];
      rawKeyword = cat.label;
    }
  }
  const purpose = PURPOSES.find((p) => text.includes(p));
  // budget: support 万 / 千 / 数字+日元/円/元
  let budget: number | undefined;
  const wan = text.match(/(\d+(?:\.\d+)?)\s*万/);
  const qian = text.match(/(\d+(?:\.\d+)?)\s*千/);
  const yen = text.match(/(\d{3,6})\s*(?:日元|円|元|jpy)/i);
  if (wan) budget = Math.round(parseFloat(wan[1]) * 10000);
  else if (qian) budget = Math.round(parseFloat(qian[1]) * 1000);
  else if (yen) budget = parseInt(yen[1], 10);
  const rareOnly = /孤品|限量|稀有|限定/.test(text);
  return { category: cat.label, categoryKey: cat.key, purpose, budget, rareOnly, rawKeyword };
}

const VARIANT_ADJ = ["复古", "极简", "限量", "手作", "纪念款", "典藏"];

export function generateShopResults(intent: ShopIntent): Product[] {
  const base = intent.budget ?? 20000;
  const prices = [Math.round(base * 0.55), Math.round(base * 0.78), Math.round(base * 0.95)];
  const stocks = [1, 3, 5];
  const tagsBase = [intent.purpose, intent.category, "日本好物"].filter(Boolean) as string[];
  return prices.map((price, i) => {
    const adj = VARIANT_ADJ[(i + intent.category.length) % VARIANT_ADJ.length];
    const name = `${adj}${intent.category}`;
    return {
      id: `gen-${intent.categoryKey}-${i}-${Date.now()}`,
      sku: `GEN-${intent.categoryKey.toUpperCase()}-${i + 1}`,
      name,
      category: intent.category,
      price,
      stock: stocks[i],
      tags: i === 0 && intent.rareOnly ? [...tagsBase, "库存孤品"] : tagsBase,
      description: `AI 根据「${intent.rawKeyword}」实时生成的${intent.category}推荐。${intent.purpose ? `适合${intent.purpose}。` : ""}`,
    };
  });
}

// ---------- booking ----------

const SERVICE_TYPES = [
  "面部护理",
  "美甲",
  "美发",
  "按摩",
  "spa",
  "瑜伽",
  "桑拿",
  "牙齿美白",
  "理发",
  "睫毛",
];
const AREAS = ["银座", "新宿", "涉谷", "池袋", "表参道", "六本木", "原宿"];
const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export type BookIntent = {
  serviceType: string;
  area: string;
  weekday?: string;
  daypart?: string;
  rawKeyword: string;
};

export function parseBookQuery(text: string): BookIntent {
  const t = text.toLowerCase();
  const svc = SERVICE_TYPES.find((s) => text.includes(s) || t.includes(s.toLowerCase())) ?? "护理";
  const area = AREAS.find((a) => text.includes(a)) ?? "东京";
  const weekday = WEEKDAYS.find((w) => text.includes(w));
  const daypart = text.includes("上午")
    ? "上午"
    : text.includes("下午")
      ? "下午"
      : text.includes("晚上")
        ? "晚上"
        : undefined;
  return { serviceType: svc, area, weekday, daypart, rawKeyword: svc };
}

export function generateBookingResults(intent: BookIntent): Service[] {
  const wd = intent.weekday ?? "周六";
  const times =
    intent.daypart === "上午"
      ? [`${wd} 10:00`, `${wd} 11:00`]
      : intent.daypart === "晚上"
        ? [`${wd} 18:00`, `${wd} 19:30`]
        : [`${wd} 14:00`, `${wd} 15:30`, `${wd} 17:00`];
  return [
    {
      id: `gen-svc-basic-${Date.now()}`,
      name: `${intent.serviceType}基础套餐`,
      area: intent.area,
      price: 8000,
      duration: 60,
      availableTimes: times,
      cancelPolicy: "预约前 24 小时可取消",
      description: `AI 实时匹配的${intent.area}「${intent.serviceType}」基础服务。`,
    },
    {
      id: `gen-svc-premium-${Date.now() + 1}`,
      name: `${intent.serviceType}深度套餐`,
      area: intent.area,
      price: 12800,
      duration: 90,
      availableTimes: times.slice(0, 2),
      cancelPolicy: "预约前 24 小时可取消",
      description: `${intent.area} 高级店铺，${intent.serviceType}进阶套餐。`,
    },
  ];
}
