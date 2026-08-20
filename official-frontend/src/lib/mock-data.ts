export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  tags: string[];
  description: string;
  specs?: { label: string; value: string }[];
  platformLink?: string;
  rare?: boolean;
  clip?: {
    title: string;
    duration: string;
    note: string;
    published: boolean;
    range?: string;
    sourceUrl?: string;
    sourcePlatform?: string;
    quote?: string;
  };
};

export type Service = {
  id: string;
  name: string;
  area: string;
  price: number;
  duration: number;
  availableTimes: string[];
  cancelPolicy: string;
  description: string;
};

export const initialProducts: Product[] = [
  {
    id: "p001",
    sku: "JP-CRAFT-001",
    name: "蓝色七宝烧花瓶",
    category: "日本工艺品",
    price: 18000,
    stock: 1,
    tags: ["送礼", "日本工艺", "库存孤品", "有直播讲解"],
    description:
      "适合送礼与陈列的日本七宝烧风格花瓶，蓝色釉面具有细腻光泽，适合用于玄关、书房或展示柜陈列。",
    specs: [
      { label: "高度", value: "约 18cm" },
      { label: "材质", value: "金属胎七宝烧风格" },
      { label: "状态", value: "轻微使用痕迹" },
      { label: "发货", value: "日本国内 2–3 日内发货" },
    ],
    platformLink: "https://example.com/douyin-product-link",
    rare: true,
    clip: {
      title: "主播介绍：材质与细节说明",
      duration: "00:35",
      note: "来自 5月直播回放",
      published: true,
    },
  },
  {
    id: "p002",
    sku: "JP-CRAFT-002",
    name: "手工漆器小盒",
    category: "日本工艺品",
    price: 12800,
    stock: 3,
    tags: ["礼品", "轻便", "日本传统工艺"],
    description: "适合作为小型礼品的手工漆器盒。",
  },
  {
    id: "p003",
    sku: "JP-CRAFT-003",
    name: "复古陶瓷香立",
    category: "日本工艺品",
    price: 8900,
    stock: 5,
    tags: ["家居", "纪念品", "私域热销"],
    description: "适合游客购买的轻量日本风格香立。",
  },
];

export const initialServices: Service[] = [
  {
    id: "s001",
    name: "面部护理基础套餐",
    area: "银座",
    price: 8000,
    duration: 60,
    availableTimes: ["周六 14:00", "周六 16:00", "周日 11:00"],
    cancelPolicy: "预约前 24 小时可取消",
    description:
      "适合希望进行基础清洁、保湿护理和放松体验的用户。服务包含肌肤清洁、基础护理和保湿整理。",
  },
  {
    id: "s002",
    name: "深层保湿护理",
    area: "银座",
    price: 12000,
    duration: 90,
    availableTimes: ["周六 15:00"],
    cancelPolicy: "预约前 24 小时可取消",
    description: "深度补水与肌肤修护，提供 90 分钟完整流程。",
  },
];

export type Order = {
  id: string;
  productName: string;
  user: string;
  paid: boolean;
  stockDeducted: boolean;
  fulfillment: "waiting_for_shipment" | "shipped";
};

export type Booking = {
  id: string;
  serviceName: string;
  user: string;
  time: string;
  area: string;
  paymentStatus: "authorized" | "paid";
  status: "confirmed" | "waiting_for_check-in";
};

export const initialOrders: Order[] = [
  {
    id: "ORD-2026-001",
    productName: "蓝色七宝烧花瓶",
    user: "user_8821",
    paid: true,
    stockDeducted: true,
    fulfillment: "waiting_for_shipment",
  },
  {
    id: "ORD-2026-002",
    productName: "手工漆器小盒",
    user: "user_8830",
    paid: true,
    stockDeducted: true,
    fulfillment: "shipped",
  },
];

export const initialBookings: Booking[] = [
  {
    id: "BK-8842",
    serviceName: "面部护理基础套餐",
    user: "user_8842",
    time: "周六 14:00",
    area: "银座",
    paymentStatus: "authorized",
    status: "confirmed",
  },
  {
    id: "BK-8843",
    serviceName: "深层保湿护理",
    user: "user_8843",
    time: "周六 15:00",
    area: "银座",
    paymentStatus: "paid",
    status: "waiting_for_check-in",
  },
];

export type ClipCandidate = {
  id: string;
  productId: string;
  productName: string;
  range: string;
  type: string;
  status: "pending" | "published";
  sourceUrl?: string;
  sourcePlatform?: string;
  quote?: string;
};

export const initialClipCandidates: ClipCandidate[] = [
  {
    id: "clip-1",
    productId: "p001",
    productName: "蓝色七宝烧花瓶",
    range: "00:12:30 - 00:13:05",
    type: "主播介绍",
    status: "published",
  },
  {
    id: "clip-2",
    productId: "p002",
    productName: "手工漆器小盒",
    range: "00:22:10 - 00:22:45",
    type: "细节展示",
    status: "pending",
  },
  {
    id: "clip-3",
    productId: "p003",
    productName: "复古陶瓷香立",
    range: "00:31:05 - 00:31:40",
    type: "使用场景",
    status: "pending",
  },
];
