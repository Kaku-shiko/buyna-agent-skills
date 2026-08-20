export type OfficialLanguage = "zh" | "ja" | "en";

export const defaultOfficialLanguage: OfficialLanguage = "zh";

export const officialLanguageOptions = [
  {
    code: "zh",
    label: "中文",
    shortLabel: "中",
    htmlLang: "zh-CN",
    locale: "zh-CN",
  },
  {
    code: "ja",
    label: "日本語",
    shortLabel: "日",
    htmlLang: "ja-JP",
    locale: "ja-JP",
  },
  {
    code: "en",
    label: "English",
    shortLabel: "EN",
    htmlLang: "en",
    locale: "en-US",
  },
] as const;

export type OfficialIconName =
  "bot" | "calendar" | "creditCard" | "globe" | "layers" | "package" | "store" | "users" | "zap";

export type SubscribeFieldKey =
  | "company_name"
  | "contact_name"
  | "email"
  | "phone"
  | "company_address"
  | "country"
  | "website_url"
  | "notes";

export type OfficialSubscribeField = {
  key: SubscribeFieldKey;
  label: string;
  required: boolean;
  placeholder: string;
  multiline?: boolean;
};

type OfficialIconItem = {
  icon: OfficialIconName;
  title: string;
  description: string;
  badge?: string;
};

type OfficialSiteContent = {
  meta: {
    home: {
      title: string;
      description: string;
      ogDescription: string;
    };
    pricing: {
      title: string;
      description: string;
    };
  };
  navLinks: Array<{ to: string; label: string }>;
  appNav: {
    backLabel: string;
    logout: string;
    logoutSuccess: string;
    sellerLogin: string;
    languageLabel: string;
  };
  hero: {
    eyebrow: string;
    brand: string;
    headline: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
  };
  stats: Array<{ value: string; label: string }>;
  ecosystem: {
    eyebrow: string;
    title: string;
    description: string;
    items: OfficialIconItem[];
  };
  merchant: {
    eyebrow: string;
    title: string;
    description: string;
    items: OfficialIconItem[];
  };
  pricing: {
    eyebrow: string;
    title: string;
    description: string;
    recommendedLabel: string;
    intervalLabel: string;
    setupPrefix: string;
    setupSuffix: string;
    currencyLabel: string;
    selectPrefix: string;
    providerNote: string;
  };
  aiGuideSection: {
    eyebrow: string;
    title: string;
    description: string;
    badge: string;
    cardTitle: string;
    cardDescription: string;
    steps: Array<{ step: string; title: string; description: string }>;
  };
  whyChoose: {
    title: string;
    description: string;
    items: OfficialIconItem[];
  };
  pricingPage: {
    eyebrow: string;
    title: string;
    description: string;
    recommendedLabel: string;
    intervalLabel: string;
    promoPrefix: string;
    promoMonthsSuffix: string;
    promoAfterSuffix: string;
    setupFeePrefix: string;
    loadingLabel: string;
    errorPrefix: string;
    selectPrefix: string;
    footerNote: string;
  };
  subscriptionPlanFeatures: Record<string, string[]>;
  aiGuide: {
    title: string;
    subtitle: string;
    liveLabel: string;
    welcome: string;
    suggestions: string[];
    networkError: string;
    thinking: string;
    placeholder: string;
    viewLabel: string;
    noReply: string;
    openAriaLabel: string;
    closeAriaLabel: string;
    sendAriaLabel: string;
  };
  subscribePage: {
    metaTitle: string;
    metaDescription: string;
    defaultCountry: string;
    backToPricing: string;
    loadingLabel: string;
    missingPlanPrefix: string;
    missingPlanSuffix: string;
    titlePrefix: string;
    titleSuffix: string;
    monthlyPrefix: string;
    monthlySuffix: string;
    monthlyDescription: string;
    fields: OfficialSubscribeField[];
    validationRequired: string;
    validationAgreement: string;
    noPayUrl: string;
    submitFailed: string;
    agreementPrefix: string;
    agreementSuffix: string;
    submittingLabel: string;
    submitLabel: string;
    cardSecurityNote: string;
  };
  subscriptionReturn: {
    metaTitle: string;
    missingAgreement: string;
    queryFailed: string;
    loadingTitle: string;
    activeTitle: string;
    activeDescription: string;
    homeLink: string;
    pendingTitle: string;
    pendingDescription: string;
    retryLabel: string;
    failedTitle: string;
    failedDescription: string;
    backToPricing: string;
    unknownTitle: string;
    unknownDescription: string;
    errorTitle: string;
    errorFallback: string;
  };
  paymentSuccess: {
    metaTitle: string;
    loadingTitle: string;
    loadingDescription: string;
    pendingTitle: string;
    pendingDescription: string;
    paidTitle: string;
    paidDescription: string;
    rows: {
      plan: string;
      amount: string;
      method: string;
      order: string;
      transaction: string;
      email: string;
      paidAt: string;
    };
    contactNote: string;
    viewSubscription: string;
    failedTitle: string;
    failedDescription: string;
    retryPricing: string;
    viewSubscriptionAlt: string;
  };
  root: {
    notFoundTitle: string;
    notFoundDescription: string;
    goHome: string;
    errorTitle: string;
    errorDescription: string;
    tryAgain: string;
  };
};

export type OfficialAiGuideCopy = OfficialSiteContent["aiGuide"];

const zh: OfficialSiteContent = {
  meta: {
    home: {
      title: "Buyna AI 网站一站式支付解决方案",
      description:
        "Buyna AI 网站一站式支付解决方案：商家注册即可在线收款，支持信用卡订阅扣款与多套餐管理。",
      ogDescription: "商家注册即可在线收款，支持信用卡订阅扣款与多套餐管理。",
    },
    pricing: {
      title: "套餐与定价 - Buyna AI",
      description:
        "Buyna AI 商家订阅套餐：Basic 月费 3,980 日元，Pro 月费 5,980 日元，均含 10,000 日元建站费。",
    },
  },
  navLinks: [
    { to: "/pricing", label: "套餐定价" },
    { to: "/merchant/orders", label: "订单管理" },
    { to: "/merchant/subscription", label: "我的订阅" },
  ],
  appNav: {
    backLabel: "返回上一页",
    logout: "退出",
    logoutSuccess: "已退出登录",
    sellerLogin: "商家登录",
    languageLabel: "语言",
  },
  hero: {
    eyebrow: "One-Stop Payment for Your Site",
    brand: "Buyna AI ·",
    headline: "网站一站式支付解决方案",
    description:
      "为日本商家提供「官网制作 + 商品 / 服务一键下单 + 信用卡在线扣款」的整套解决方案。注册即开通，几分钟上线属于自己的收款网站。",
    primaryCta: "查看套餐 · 立即开通",
    secondaryCta: "商家登录",
  },
  stats: [
    { value: "¥10,000", label: "初期费用" },
    { value: "¥3,980", label: "月费" },
    { value: "PCI-DSS", label: "环球支付托管" },
  ],
  ecosystem: {
    eyebrow: "Buyna.ai Ecosystem",
    title: "Buyna.ai 生态系统",
    description:
      "Buyna.ai 正在构建一个连接商家与消费者的完整商业网络：从商家官网、全球支付收款、后台管理，到 AI 购物导购，一站式覆盖建站与经营。",
    items: [
      {
        icon: "globe",
        title: "商家官网",
        description: "为商品或服务打造专属下单页面，支持多页面布局与品牌展示。",
      },
      {
        icon: "creditCard",
        title: "全球支付收款",
        description: "信用卡、银行卡、微信 / 支付宝 QR 等多种收款方式，PCI DSS 合规。",
      },
      {
        icon: "layers",
        title: "商家后台",
        description: "商品 / 服务管理、订单、客户、对账与订阅扣款，全部在一个后台。",
      },
      {
        icon: "bot",
        title: "AI 购物导购",
        description: "消费者可向 AI 询问购买与预约需求，在 Buyna.ai 生态中获得推荐。",
        badge: "Beta",
      },
    ],
  },
  merchant: {
    eyebrow: "For Merchants",
    title: "为商家打造",
    description:
      "无论你是销售实体商品，还是提供预约与服务，Buyna.ai 都能帮你快速上线自己的收款网站，并持续管理经营。",
    items: [
      {
        icon: "store",
        title: "电商型官网",
        description: "商品展示、多 SKU、购物车、下单支付，适合产品销售。",
      },
      {
        icon: "calendar",
        title: "预约型官网",
        description: "服务展示、在线预约、定金或全款支付，适合服务与预订。",
      },
      {
        icon: "creditCard",
        title: "GlobePay 收款",
        description: "信用卡、银行卡、微信 / 支付宝 QR 安全收款，资金合规托管。",
      },
      {
        icon: "package",
        title: "商品 / 服务管理",
        description: "添加、编辑、上下架，管理图片、价格、描述与库存。",
      },
      {
        icon: "users",
        title: "订单与客户跟踪",
        description: "查看订单、预约、支付状态，维护已付款客户记录。",
      },
      {
        icon: "layers",
        title: "订阅月费托管",
        description: "建站费 + 月费自动扣款，后台随时查看账单与状态。",
      },
    ],
  },
  pricing: {
    eyebrow: "Subscription Plans",
    title: "选择适合你的套餐",
    description: "通过 Global Payments 进行信用卡月费扣款，安全合规。",
    recommendedLabel: "推荐",
    intervalLabel: "/ 月",
    setupPrefix: "首次需支付",
    setupSuffix: "建站费",
    currencyLabel: "JPY",
    selectPrefix: "选择",
    providerNote: "支付由 Global Payments 托管，符合 PCI DSS 标准。",
  },
  aiGuideSection: {
    eyebrow: "AI Shopping Guide",
    title: "AI 购物导购",
    description:
      "Buyna.ai 正在为消费者提供 AI 购物向导。消费者只需告诉 AI 想买什么或想预约什么服务，AI 就会在 Buyna.ai 生态中推荐相关的商品、服务与商家网站。",
    badge: "Beta",
    cardTitle: "AI 帮你发现好商品与好服务",
    cardDescription:
      "输入你的需求，即可获得 Buyna.ai 生态内商家的推荐。帮助消费者更快找到想买的东西，也为入驻商家带来更精准的流量。",
    steps: [
      {
        step: "01",
        title: "消费者提问",
        description: "“我想买京都手工漆器礼盒”或“我想预约东京美甲服务”。",
      },
      {
        step: "02",
        title: "AI 理解需求",
        description: "AI 解析购买意图、预算、地点与偏好，匹配生态内商家。",
      },
      {
        step: "03",
        title: "获得推荐",
        description: "得到相关商品、服务与商家官网链接，直接下单或预约。",
      },
    ],
  },
  whyChoose: {
    title: "为什么选择 Buyna AI",
    description: "我们为你交付一个能直接收钱的官网，并把支付、对账、订阅扣款全部托管。",
    items: [
      {
        icon: "globe",
        title: "官网制作",
        description: "为商品 / 服务定制下单页面，支持公司介绍与多页面布局。",
      },
      {
        icon: "zap",
        title: "一键下单支付",
        description: "客户在你的官网上选商品 / 预约后，直接跳转 GlobePay 完成信用卡付款。",
      },
      {
        icon: "layers",
        title: "订阅扣款托管",
        description: "建站费 + 月费由 Global Payments 自动扣款，发票与状态在后台一目了然。",
      },
    ],
  },
  pricingPage: {
    eyebrow: "Subscription",
    title: "选择适合你的套餐",
    description: "所有套餐通过 Global Payments 进行信用卡月费扣款，安全合规。",
    recommendedLabel: "推荐",
    intervalLabel: "/ 月",
    promoPrefix: "前",
    promoMonthsSuffix: "个月",
    promoAfterSuffix: "个月后",
    setupFeePrefix: "首次开通费",
    loadingLabel: "加载中...",
    errorPrefix: "无法加载套餐价格：",
    selectPrefix: "选择",
    footerNote: "点击“选择套餐”后需要登录并填写公司信息，随后跳转到 GlobePay 完成信用卡扣款授权。",
  },
  subscriptionPlanFeatures: {
    basic: [
      "官网制作（商品 / 服务展示）",
      "商品 / 服务一键下单支付（信用卡）",
      "最多 20 个 SKU，3 个页面以内",
      "每月免费修改 2 次",
      "标准客服支持",
    ],
    pro: ["Basic 全部功能", "200+ SKU", "每周免费修改 1 次", "更高页面与 SKU 上限", "优先客服支持"],
  },
  aiGuide: {
    title: "Buyna.ai AI 购物导购",
    subtitle: "AI Shopping Guide / Beta",
    liveLabel: "Live",
    welcome: "你好，我是 Buyna.ai AI 购物导购。告诉我你想买什么、想预约什么服务。",
    suggestions: ["我想买XXXX", "有哪些旅游线路推荐", "我能用什么付款"],
    networkError: "网络错误，请稍后再试。",
    thinking: "正在思考...",
    placeholder: "想买什么？想预约什么？",
    viewLabel: "查看",
    noReply: "(暂无回复)",
    openAriaLabel: "打开 AI 购物导购",
    closeAriaLabel: "关闭",
    sendAriaLabel: "发送",
  },
  subscribePage: {
    metaTitle: "开通订阅 - Buyna.ai",
    metaDescription: "使用 GlobePay 信用卡月费扣款订阅 Buyna.ai。",
    defaultCountry: "日本",
    backToPricing: "返回套餐",
    loadingLabel: "加载中...",
    missingPlanPrefix: "套餐",
    missingPlanSuffix: "不存在",
    titlePrefix: "开通",
    titleSuffix: "月度订阅",
    monthlyPrefix: "月费",
    monthlySuffix: "/ 月",
    monthlyDescription: "通过 GlobePay 信用卡自动扣款。",
    fields: [
      {
        key: "company_name",
        label: "公司名称 / Company",
        required: true,
        placeholder: "Example Inc.",
      },
      {
        key: "contact_name",
        label: "负责人姓名 / Contact",
        required: true,
        placeholder: "山田 太郎",
      },
      { key: "email", label: "联系邮箱 / Email", required: true, placeholder: "owner@example.com" },
      { key: "phone", label: "电话 / Phone", required: false, placeholder: "+81-90-0000-0000" },
      {
        key: "company_address",
        label: "公司地址 / Address",
        required: false,
        placeholder: "东京都中央区银座 1-1-1",
        multiline: true,
      },
      { key: "country", label: "国家 / Country", required: false, placeholder: "日本" },
      {
        key: "website_url",
        label: "官网 URL",
        required: false,
        placeholder: "https://example.com",
      },
      {
        key: "notes",
        label: "备注 / Notes",
        required: false,
        placeholder: "对 Buyna.ai 的期望",
        multiline: true,
      },
    ],
    validationRequired: "请填写公司名称、联系人和邮箱",
    validationAgreement: "请勾选同意月度自动扣款条款",
    noPayUrl: "未能获取支付跳转地址，请稍后重试。",
    submitFailed: "提交失败",
    agreementPrefix: "我同意 Buyna.ai 每月自动通过 GlobePay 从我绑定的信用卡扣款",
    agreementSuffix:
      "(JPY)，直到我在管理后台取消订阅。首次授权将由 GlobePay 通过 3DS 安全页面完成。",
    submittingLabel: "跳转到 GlobePay...",
    submitLabel: "使用信用卡开通订阅",
    cardSecurityNote: "卡号 / 有效期 / CVV 在 GlobePay 官方安全页面输入，Buyna.ai 不接触卡片信息。",
  },
  subscriptionReturn: {
    metaTitle: "订阅结果 - Buyna.ai",
    missingAgreement: "缺少 agreement 参数",
    queryFailed: "查询失败",
    loadingTitle: "正在确认订阅授权...",
    activeTitle: "订阅已激活",
    activeDescription: "信用卡授权成功，后续将按月自动扣款。",
    homeLink: "返回首页",
    pendingTitle: "授权处理中",
    pendingDescription: "支付平台尚未返回最终结果，请稍等片刻后重试。",
    retryLabel: "重新查询",
    failedTitle: "订阅授权失败",
    failedDescription: "未能完成信用卡授权，请稍后重试或更换卡片。",
    backToPricing: "返回套餐",
    unknownTitle: "订阅状态未确认",
    unknownDescription: "暂时无法确认订阅状态，请稍后重试。",
    errorTitle: "查询出错",
    errorFallback: "请稍后重试。",
  },
  paymentSuccess: {
    metaTitle: "支付状态 - Buyna AI",
    loadingTitle: "正在确认支付结果",
    loadingDescription: "请稍候，我们正在核对订单状态。",
    pendingTitle: "等待 GlobePay 支付确认中",
    pendingDescription: "GlobePay 通常会在数秒内回调。页面会自动刷新状态。",
    paidTitle: "支付成功",
    paidDescription: "我们已收到你的首笔付款。",
    rows: {
      plan: "套餐",
      amount: "支付金额",
      method: "支付方式",
      order: "订单号",
      transaction: "GlobePay 流水",
      email: "联系邮箱",
      paidAt: "到账时间",
    },
    contactNote: "Buyna.ai 团队会尽快通过邮件联系你，开始官网制作流程。",
    viewSubscription: "查看我的订阅",
    failedTitle: "支付未完成",
    failedDescription: "我们暂未收到 GlobePay 的支付成功回调，订单尚未激活。你可以重试或联系客服。",
    retryPricing: "返回套餐页重试",
    viewSubscriptionAlt: "查看订阅",
  },
  root: {
    notFoundTitle: "页面不存在",
    notFoundDescription: "你访问的页面不存在，或已经被移动。",
    goHome: "返回首页",
    errorTitle: "页面加载失败",
    errorDescription: "这边出了点问题。你可以刷新重试，或返回首页。",
    tryAgain: "重试",
  },
};

const ja: OfficialSiteContent = {
  meta: {
    home: {
      title: "Buyna AI 公式サイト向けワンストップ決済ソリューション",
      description:
        "Buyna AIは、日本の事業者向けに公式サイト制作、商品・サービス注文、オンライン決済、サブスクリプション管理をまとめて提供します。",
      ogDescription: "公式サイト制作から決済、サブスクリプション管理までを一体で提供します。",
    },
    pricing: {
      title: "プランと料金 - Buyna AI",
      description:
        "Buyna AIの事業者向けサブスクリプション。Basicは月額3,980円、Proは月額5,980円、初期制作費は10,000円です。",
    },
  },
  navLinks: [
    { to: "/pricing", label: "料金プラン" },
    { to: "/merchant/orders", label: "注文管理" },
    { to: "/merchant/subscription", label: "契約状況" },
  ],
  appNav: {
    backLabel: "前のページへ戻る",
    logout: "ログアウト",
    logoutSuccess: "ログアウトしました",
    sellerLogin: "事業者ログイン",
    languageLabel: "言語",
  },
  hero: {
    eyebrow: "One-Stop Payment for Your Site",
    brand: "Buyna AI ·",
    headline: "公式サイト決済をワンストップで",
    description:
      "日本の事業者に、公式サイト制作、商品 / サービスの注文導線、クレジットカード決済を一体で提供します。登録後すぐに、自社の決済サイトを公開できます。",
    primaryCta: "料金プランを見る",
    secondaryCta: "事業者ログイン",
  },
  stats: [
    { value: "¥10,000", label: "初期費用" },
    { value: "¥3,980", label: "月額" },
    { value: "PCI-DSS", label: "決済基盤" },
  ],
  ecosystem: {
    eyebrow: "Buyna.ai Ecosystem",
    title: "Buyna.ai エコシステム",
    description:
      "Buyna.aiは、事業者と消費者をつなぐ商取引ネットワークを構築しています。公式サイト、決済、管理画面、AIショッピングガイドまで、運営に必要な流れを一つにつなげます。",
    items: [
      {
        icon: "globe",
        title: "事業者公式サイト",
        description: "商品やサービスに合わせた注文ページを作成し、ブランド紹介にも対応します。",
      },
      {
        icon: "creditCard",
        title: "グローバル決済",
        description: "クレジットカード、銀行カード、WeChat Pay / Alipay QRなどに対応します。",
      },
      {
        icon: "layers",
        title: "事業者管理画面",
        description:
          "商品 / サービス、注文、顧客、請求、サブスクリプションを一つの画面で管理できます。",
      },
      {
        icon: "bot",
        title: "AIショッピングガイド",
        description: "消費者の購入・予約ニーズをAIが理解し、Buyna.ai内の事業者を推薦します。",
        badge: "Beta",
      },
    ],
  },
  merchant: {
    eyebrow: "For Merchants",
    title: "事業者のための運営基盤",
    description:
      "物販でも予約サービスでも、Buyna.aiなら決済可能な公式サイトをすばやく公開し、その後の運営も継続して管理できます。",
    items: [
      {
        icon: "store",
        title: "EC型公式サイト",
        description: "商品表示、SKU、注文、決済までをまとめて用意します。",
      },
      {
        icon: "calendar",
        title: "予約型公式サイト",
        description: "サービス紹介、オンライン予約、デポジットまたは全額決済に対応します。",
      },
      {
        icon: "creditCard",
        title: "GlobePay決済",
        description: "クレジットカード、銀行カード、WeChat Pay / Alipay QRで安全に決済できます。",
      },
      {
        icon: "package",
        title: "商品 / サービス管理",
        description: "追加、編集、公開停止、画像、価格、説明、在庫を管理できます。",
      },
      {
        icon: "users",
        title: "注文と顧客管理",
        description: "注文、予約、支払い状況、支払い済み顧客の記録を確認できます。",
      },
      {
        icon: "layers",
        title: "月額課金の管理",
        description: "初期制作費と月額費用の自動決済、請求状況を管理画面で確認できます。",
      },
    ],
  },
  pricing: {
    eyebrow: "Subscription Plans",
    title: "最適なプランを選ぶ",
    description: "Global Paymentsによるクレジットカード月額決済で、安全に運用できます。",
    recommendedLabel: "おすすめ",
    intervalLabel: "/ 月",
    setupPrefix: "初回",
    setupSuffix: "制作費",
    currencyLabel: "JPY",
    selectPrefix: "選択",
    providerNote: "決済はGlobal Paymentsが管理し、PCI DSS標準に準拠しています。",
  },
  aiGuideSection: {
    eyebrow: "AI Shopping Guide",
    title: "AIショッピングガイド",
    description:
      "Buyna.aiは、消費者向けAIショッピングガイドを提供します。欲しい商品や予約したいサービスを伝えるだけで、AIがBuyna.ai内の関連商品、サービス、事業者サイトを推薦します。",
    badge: "Beta",
    cardTitle: "AIが商品とサービスとの出会いをつくる",
    cardDescription:
      "ニーズを入力すると、Buyna.aiエコシステム内の事業者から候補を提示します。消費者の探索を短くし、事業者にはより精度の高い流入を届けます。",
    steps: [
      {
        step: "01",
        title: "消費者が質問",
        description: "例：「京都の手作り漆器ギフトを探したい」「東京でネイルを予約したい」。",
      },
      {
        step: "02",
        title: "AIが意図を理解",
        description: "購入意図、予算、場所、好みを読み取り、関連する事業者と照合します。",
      },
      {
        step: "03",
        title: "おすすめを表示",
        description:
          "商品、サービス、事業者サイトへのリンクを受け取り、そのまま注文や予約へ進めます。",
      },
    ],
  },
  whyChoose: {
    title: "Buyna AIが選ばれる理由",
    description:
      "ただ見せるだけのサイトではなく、すぐに決済を受けられる公式サイトを納品し、決済、請求、サブスクリプションをまとめて支えます。",
    items: [
      {
        icon: "globe",
        title: "公式サイト制作",
        description: "商品 / サービスの注文ページ、会社紹介、複数ページ構成に対応します。",
      },
      {
        icon: "zap",
        title: "注文から決済まで",
        description: "顧客が商品選択や予約を行い、GlobePayでクレジットカード決済へ進めます。",
      },
      {
        icon: "layers",
        title: "サブスクリプション管理",
        description:
          "初期制作費と月額費用はGlobal Paymentsで自動決済し、状態を管理画面で確認できます。",
      },
    ],
  },
  pricingPage: {
    eyebrow: "Subscription",
    title: "最適なプランを選ぶ",
    description: "すべてのプランはGlobal Paymentsのクレジットカード月額決済で安全に管理されます。",
    recommendedLabel: "おすすめ",
    intervalLabel: "/ 月",
    promoPrefix: "最初の",
    promoMonthsSuffix: "か月",
    promoAfterSuffix: "か月後",
    setupFeePrefix: "初期制作費",
    loadingLabel: "読み込み中...",
    errorPrefix: "プラン価格を読み込めません: ",
    selectPrefix: "選択",
    footerNote:
      "「プランを選択」をクリックすると、ログインと会社情報の入力後、GlobePayのクレジットカード認証画面へ進みます。",
  },
  subscriptionPlanFeatures: {
    basic: [
      "公式サイト制作（商品 / サービス表示）",
      "商品 / サービスの注文とクレジットカード決済",
      "最大20 SKU、3ページ以内",
      "毎月2回まで無料修正",
      "標準サポート",
    ],
    pro: [
      "Basicの全機能",
      "200+ SKU",
      "毎週1回まで無料修正",
      "より高いページ数とSKU上限",
      "優先サポート",
    ],
  },
  aiGuide: {
    title: "Buyna.ai AIショッピングガイド",
    subtitle: "AI Shopping Guide / Beta",
    liveLabel: "Live",
    welcome:
      "こんにちは。Buyna.aiのAIショッピングガイドです。欲しい商品や予約したいサービスを教えてください。",
    suggestions: ["XXXXを買いたい", "おすすめの旅行コースは？", "どんな支払い方法が使えますか？"],
    networkError: "通信エラーです。少し時間をおいて再度お試しください。",
    thinking: "考えています...",
    placeholder: "何を買いたいですか？何を予約したいですか？",
    viewLabel: "見る",
    noReply: "(返信がありません)",
    openAriaLabel: "AIショッピングガイドを開く",
    closeAriaLabel: "閉じる",
    sendAriaLabel: "送信",
  },
  subscribePage: {
    metaTitle: "サブスクリプション開始 - Buyna.ai",
    metaDescription: "GlobePayのクレジットカード月額決済でBuyna.aiを契約します。",
    defaultCountry: "日本",
    backToPricing: "料金プランへ戻る",
    loadingLabel: "読み込み中...",
    missingPlanPrefix: "プラン",
    missingPlanSuffix: "が見つかりません",
    titlePrefix: "",
    titleSuffix: "月額プランを開始",
    monthlyPrefix: "月額",
    monthlySuffix: "/ 月",
    monthlyDescription: "GlobePayのクレジットカードで自動決済されます。",
    fields: [
      {
        key: "company_name",
        label: "会社名 / Company",
        required: true,
        placeholder: "Example Inc.",
      },
      {
        key: "contact_name",
        label: "担当者名 / Contact",
        required: true,
        placeholder: "山田 太郎",
      },
      { key: "email", label: "メール / Email", required: true, placeholder: "owner@example.com" },
      { key: "phone", label: "電話番号 / Phone", required: false, placeholder: "+81-90-0000-0000" },
      {
        key: "company_address",
        label: "会社住所 / Address",
        required: false,
        placeholder: "東京都中央区銀座 1-1-1",
        multiline: true,
      },
      { key: "country", label: "国 / Country", required: false, placeholder: "日本" },
      {
        key: "website_url",
        label: "公式サイトURL",
        required: false,
        placeholder: "https://example.com",
      },
      {
        key: "notes",
        label: "備考 / Notes",
        required: false,
        placeholder: "Buyna.aiへのご要望",
        multiline: true,
      },
    ],
    validationRequired: "会社名、担当者名、メールを入力してください",
    validationAgreement: "月額自動決済の同意にチェックしてください",
    noPayUrl: "決済ページのURLを取得できませんでした。時間をおいて再度お試しください。",
    submitFailed: "送信に失敗しました",
    agreementPrefix: "Buyna.aiが毎月、登録したクレジットカードからGlobePay経由で",
    agreementSuffix:
      "(JPY)を自動決済することに同意します。初回認証はGlobePayの3DS安全ページで行われます。",
    submittingLabel: "GlobePayへ移動中...",
    submitLabel: "クレジットカードで契約を開始",
    cardSecurityNote:
      "カード番号 / 有効期限 / CVVはGlobePay公式の安全ページで入力され、Buyna.aiはカード情報を保持しません。",
  },
  subscriptionReturn: {
    metaTitle: "契約結果 - Buyna.ai",
    missingAgreement: "agreementパラメータがありません",
    queryFailed: "確認に失敗しました",
    loadingTitle: "サブスクリプション認証を確認しています...",
    activeTitle: "契約が有効になりました",
    activeDescription: "クレジットカード認証が完了しました。以後、月額費用が自動決済されます。",
    homeLink: "ホームへ戻る",
    pendingTitle: "認証処理中",
    pendingDescription:
      "決済プラットフォームの最終結果を待っています。少し時間をおいて再度確認してください。",
    retryLabel: "再確認",
    failedTitle: "認証に失敗しました",
    failedDescription:
      "クレジットカード認証が完了しませんでした。時間をおいて再試行するか、別のカードをお試しください。",
    backToPricing: "料金プランへ戻る",
    unknownTitle: "契約状態を確認できません",
    unknownDescription: "現在、契約状態を確認できません。時間をおいて再度お試しください。",
    errorTitle: "確認エラー",
    errorFallback: "時間をおいて再度お試しください。",
  },
  paymentSuccess: {
    metaTitle: "決済状況 - Buyna AI",
    loadingTitle: "決済結果を確認しています",
    loadingDescription: "注文状態を照合しています。少々お待ちください。",
    pendingTitle: "GlobePayの決済確認を待っています",
    pendingDescription: "GlobePayは通常数秒以内に通知します。このページは自動で状態を更新します。",
    paidTitle: "決済が完了しました",
    paidDescription: "初回のお支払いを受領しました。",
    rows: {
      plan: "プラン",
      amount: "決済金額",
      method: "決済方法",
      order: "注文番号",
      transaction: "GlobePay取引番号",
      email: "連絡先メール",
      paidAt: "入金時刻",
    },
    contactNote: "Buyna.aiチームよりメールでご連絡し、公式サイト制作を開始します。",
    viewSubscription: "契約状況を見る",
    failedTitle: "決済が完了していません",
    failedDescription:
      "GlobePayから決済成功の通知をまだ受け取っていません。再試行するか、サポートへご連絡ください。",
    retryPricing: "料金プランへ戻って再試行",
    viewSubscriptionAlt: "契約状況を見る",
  },
  root: {
    notFoundTitle: "ページが見つかりません",
    notFoundDescription: "お探しのページは存在しないか、移動された可能性があります。",
    goHome: "ホームへ戻る",
    errorTitle: "ページを読み込めませんでした",
    errorDescription: "問題が発生しました。再読み込みするか、ホームへ戻ってください。",
    tryAgain: "再試行",
  },
};

const en: OfficialSiteContent = {
  meta: {
    home: {
      title: "Buyna AI One-Stop Website Payment Solution",
      description:
        "Buyna AI helps merchants launch official websites with online payments, subscription billing, and plan management.",
      ogDescription:
        "Launch an official website with payments, subscription billing, and merchant tools.",
    },
    pricing: {
      title: "Plans and Pricing - Buyna AI",
      description:
        "Buyna AI merchant plans: Basic from JPY 3,980/month and Pro from JPY 5,980/month, each with a JPY 10,000 setup fee.",
    },
  },
  navLinks: [
    { to: "/pricing", label: "Pricing" },
    { to: "/merchant/orders", label: "Orders" },
    { to: "/merchant/subscription", label: "Subscription" },
  ],
  appNav: {
    backLabel: "Go back",
    logout: "Log out",
    logoutSuccess: "Logged out",
    sellerLogin: "Merchant login",
    languageLabel: "Language",
  },
  hero: {
    eyebrow: "One-Stop Payment for Your Site",
    brand: "Buyna AI ·",
    headline: "One-stop website payments",
    description:
      "For merchants in Japan, Buyna.ai combines official website production, product or service ordering, and online credit-card payment into one launch-ready package.",
    primaryCta: "View plans",
    secondaryCta: "Merchant login",
  },
  stats: [
    { value: "¥10,000", label: "Initial fee" },
    { value: "¥3,980", label: "Monthly fee" },
    { value: "PCI-DSS", label: "Payment custody" },
  ],
  ecosystem: {
    eyebrow: "Buyna.ai Ecosystem",
    title: "The Buyna.ai ecosystem",
    description:
      "Buyna.ai is building a commerce network that connects merchants and buyers: official websites, global payments, back-office management, and an AI shopping guide in one operating flow.",
    items: [
      {
        icon: "globe",
        title: "Merchant websites",
        description:
          "Create dedicated order pages for products or services, with brand and multi-page support.",
      },
      {
        icon: "creditCard",
        title: "Global payments",
        description:
          "Accept credit cards, bank cards, WeChat Pay QR, Alipay QR, and more through compliant payment flows.",
      },
      {
        icon: "layers",
        title: "Merchant back office",
        description:
          "Manage products, services, orders, customers, reconciliation, and subscription billing in one place.",
      },
      {
        icon: "bot",
        title: "AI shopping guide",
        description:
          "Buyers can ask AI for product or booking recommendations inside the Buyna.ai ecosystem.",
        badge: "Beta",
      },
    ],
  },
  merchant: {
    eyebrow: "For Merchants",
    title: "Built for merchants",
    description:
      "Whether you sell physical products or provide bookable services, Buyna.ai helps you publish a payment-ready official website and keep operating it after launch.",
    items: [
      {
        icon: "store",
        title: "Ecommerce websites",
        description: "Product display, SKUs, ordering, and payment for product sales.",
      },
      {
        icon: "calendar",
        title: "Booking websites",
        description:
          "Service pages, online booking, deposits, or full payment for service businesses.",
      },
      {
        icon: "creditCard",
        title: "GlobePay checkout",
        description:
          "Secure card, bank card, WeChat Pay QR, and Alipay QR collection through GlobePay.",
      },
      {
        icon: "package",
        title: "Product / service management",
        description:
          "Add, edit, publish, pause, and manage images, pricing, descriptions, and stock.",
      },
      {
        icon: "users",
        title: "Orders and customers",
        description: "Track orders, bookings, payment status, and paid-customer records.",
      },
      {
        icon: "layers",
        title: "Subscription billing",
        description:
          "Setup fee and monthly billing are handled automatically, with status visible in the dashboard.",
      },
    ],
  },
  pricing: {
    eyebrow: "Subscription Plans",
    title: "Choose the right plan",
    description:
      "Monthly card billing is handled through Global Payments with secure, compliant processing.",
    recommendedLabel: "Recommended",
    intervalLabel: "/ month",
    setupPrefix: "Initial",
    setupSuffix: "setup fee",
    currencyLabel: "JPY",
    selectPrefix: "Select",
    providerNote: "Payments are managed by Global Payments and follow PCI DSS standards.",
  },
  aiGuideSection: {
    eyebrow: "AI Shopping Guide",
    title: "AI shopping guide",
    description:
      "Buyna.ai is building an AI shopping guide for consumers. Buyers can describe what they want to purchase or book, and AI recommends relevant products, services, and merchant websites inside the Buyna.ai ecosystem.",
    badge: "Beta",
    cardTitle: "AI helps buyers discover better products and services",
    cardDescription:
      "Enter a need and get recommendations from Buyna.ai merchants. Buyers find what they want faster, and merchants receive more qualified traffic.",
    steps: [
      {
        step: "01",
        title: "The buyer asks",
        description:
          "For example: “I want a handmade Kyoto lacquerware gift” or “I want to book a nail service in Tokyo.”",
      },
      {
        step: "02",
        title: "AI understands intent",
        description:
          "AI reads intent, budget, location, and preferences, then matches merchants in the ecosystem.",
      },
      {
        step: "03",
        title: "Recommendations appear",
        description:
          "The buyer receives product, service, and merchant-site links, then orders or books directly.",
      },
    ],
  },
  whyChoose: {
    title: "Why choose Buyna AI",
    description:
      "We deliver an official website that can accept payments immediately, then support payment, reconciliation, and subscription billing.",
    items: [
      {
        icon: "globe",
        title: "Official website production",
        description:
          "Custom order pages for products or services, with company information and multi-page layouts.",
      },
      {
        icon: "zap",
        title: "Order and pay in one flow",
        description:
          "Customers choose products or bookings on your site, then complete credit-card payment through GlobePay.",
      },
      {
        icon: "layers",
        title: "Subscription billing managed",
        description:
          "Setup and monthly fees are charged through Global Payments, with invoices and status in the dashboard.",
      },
    ],
  },
  pricingPage: {
    eyebrow: "Subscription",
    title: "Choose the right plan",
    description: "All plans use secure monthly credit-card billing through Global Payments.",
    recommendedLabel: "Recommended",
    intervalLabel: "/ month",
    promoPrefix: "First ",
    promoMonthsSuffix: " months",
    promoAfterSuffix: " months later",
    setupFeePrefix: "Initial setup fee",
    loadingLabel: "Loading...",
    errorPrefix: "Unable to load plan pricing: ",
    selectPrefix: "Select",
    footerNote:
      "After selecting a plan, you will log in, enter company information, and continue to GlobePay for credit-card authorization.",
  },
  subscriptionPlanFeatures: {
    basic: [
      "Official website production for products or services",
      "One-click product / service order and card payment",
      "Up to 20 SKUs and 3 pages",
      "2 free monthly edits",
      "Standard support",
    ],
    pro: [
      "Everything in Basic",
      "200+ SKUs",
      "1 free edit every week",
      "Higher page and SKU limits",
      "Priority support",
    ],
  },
  aiGuide: {
    title: "Buyna.ai AI Shopping Guide",
    subtitle: "AI Shopping Guide / Beta",
    liveLabel: "Live",
    welcome:
      "Hi, I’m the Buyna.ai AI shopping guide. Tell me what you want to buy or what service you want to book.",
    suggestions: [
      "I want to buy XXXX",
      "Which travel itineraries do you recommend?",
      "What can I pay with?",
    ],
    networkError: "Network error. Please try again later.",
    thinking: "Thinking...",
    placeholder: "What do you want to buy or book?",
    viewLabel: "View",
    noReply: "(no reply)",
    openAriaLabel: "Open AI shopping guide",
    closeAriaLabel: "Close",
    sendAriaLabel: "Send",
  },
  subscribePage: {
    metaTitle: "Start Subscription - Buyna.ai",
    metaDescription: "Subscribe to Buyna.ai with monthly credit-card billing through GlobePay.",
    defaultCountry: "Japan",
    backToPricing: "Back to pricing",
    loadingLabel: "Loading...",
    missingPlanPrefix: "Plan",
    missingPlanSuffix: "does not exist",
    titlePrefix: "Start",
    titleSuffix: "monthly subscription",
    monthlyPrefix: "Monthly fee",
    monthlySuffix: "/ month",
    monthlyDescription: "Billed automatically by credit card through GlobePay.",
    fields: [
      { key: "company_name", label: "Company name", required: true, placeholder: "Example Inc." },
      { key: "contact_name", label: "Contact name", required: true, placeholder: "Taro Yamada" },
      { key: "email", label: "Email", required: true, placeholder: "owner@example.com" },
      { key: "phone", label: "Phone", required: false, placeholder: "+81-90-0000-0000" },
      {
        key: "company_address",
        label: "Company address",
        required: false,
        placeholder: "1-1-1 Ginza, Chuo-ku, Tokyo",
        multiline: true,
      },
      { key: "country", label: "Country", required: false, placeholder: "Japan" },
      {
        key: "website_url",
        label: "Website URL",
        required: false,
        placeholder: "https://example.com",
      },
      {
        key: "notes",
        label: "Notes",
        required: false,
        placeholder: "What do you expect from Buyna.ai?",
        multiline: true,
      },
    ],
    validationRequired: "Please enter company name, contact name, and email",
    validationAgreement: "Please agree to monthly automatic billing",
    noPayUrl: "Could not get the payment redirect URL. Please try again later.",
    submitFailed: "Submission failed",
    agreementPrefix:
      "I agree that Buyna.ai may charge my saved credit card through GlobePay each month for",
    agreementSuffix:
      "(JPY) until I cancel the subscription in the dashboard. The first authorization is completed on GlobePay’s secure 3DS page.",
    submittingLabel: "Redirecting to GlobePay...",
    submitLabel: "Start subscription by credit card",
    cardSecurityNote:
      "Card number, expiry, and CVV are entered on GlobePay’s secure official page. Buyna.ai does not handle card details.",
  },
  subscriptionReturn: {
    metaTitle: "Subscription Result - Buyna.ai",
    missingAgreement: "Missing agreement parameter",
    queryFailed: "Query failed",
    loadingTitle: "Confirming subscription authorization...",
    activeTitle: "Subscription activated",
    activeDescription: "Card authorization succeeded. Monthly billing will run automatically.",
    homeLink: "Back to home",
    pendingTitle: "Authorization processing",
    pendingDescription:
      "The payment platform has not returned the final result yet. Please wait a moment and retry.",
    retryLabel: "Check again",
    failedTitle: "Subscription authorization failed",
    failedDescription:
      "Card authorization could not be completed. Please retry later or use another card.",
    backToPricing: "Back to pricing",
    unknownTitle: "Subscription status not confirmed",
    unknownDescription:
      "We cannot confirm the subscription status right now. Please try again later.",
    errorTitle: "Query error",
    errorFallback: "Please try again later.",
  },
  paymentSuccess: {
    metaTitle: "Payment Status - Buyna AI",
    loadingTitle: "Confirming payment result",
    loadingDescription: "Please wait while we check the order status.",
    pendingTitle: "Waiting for GlobePay confirmation",
    pendingDescription:
      "GlobePay usually calls back within a few seconds. This page will refresh the status automatically.",
    paidTitle: "Payment successful",
    paidDescription: "We have received your first payment.",
    rows: {
      plan: "Plan",
      amount: "Payment amount",
      method: "Payment method",
      order: "Order ID",
      transaction: "GlobePay transaction",
      email: "Contact email",
      paidAt: "Paid at",
    },
    contactNote:
      "The Buyna.ai team will contact you by email soon to start the website production process.",
    viewSubscription: "View my subscription",
    failedTitle: "Payment not completed",
    failedDescription:
      "We have not received a successful GlobePay payment callback yet, so the order is not active. You can retry or contact support.",
    retryPricing: "Back to pricing and retry",
    viewSubscriptionAlt: "View subscription",
  },
  root: {
    notFoundTitle: "Page not found",
    notFoundDescription: "The page you're looking for doesn't exist or has been moved.",
    goHome: "Go home",
    errorTitle: "This page didn't load",
    errorDescription: "Something went wrong on our end. You can try refreshing or head back home.",
    tryAgain: "Try again",
  },
};

export const officialSiteContentByLanguage: Record<OfficialLanguage, OfficialSiteContent> = {
  zh,
  ja,
  en,
};

export function isOfficialLanguage(value: string | null | undefined): value is OfficialLanguage {
  return value === "zh" || value === "ja" || value === "en";
}

export function normalizeOfficialLanguage(value: string | null | undefined): OfficialLanguage {
  return isOfficialLanguage(value) ? value : defaultOfficialLanguage;
}

export function getOfficialLanguageOption(language: OfficialLanguage) {
  return (
    officialLanguageOptions.find((option) => option.code === language) ?? officialLanguageOptions[0]
  );
}

export function getOfficialSiteContent(language: OfficialLanguage = defaultOfficialLanguage) {
  return officialSiteContentByLanguage[normalizeOfficialLanguage(language)];
}

export const officialSiteMeta = zh.meta;
export const officialNavLinks = zh.navLinks;
export const homeHeroContent = zh.hero;
export const homeStats = zh.stats;
export const homeEcosystemSection = zh.ecosystem;
export const homeMerchantSection = zh.merchant;
export const homePricingSection = zh.pricing;
export const homeAiGuideSection = zh.aiGuideSection;
export const homeWhyChooseSection = zh.whyChoose;
export const pricingPageContent = zh.pricingPage;
export const subscriptionPlanFeatures = zh.subscriptionPlanFeatures;

export const recommendedSubscriptionPlanCode = "pro";

export const homepageSubscriptionPlans = [
  {
    code: "basic",
    name: "Basic",
    monthly: 3980,
    original: 2980,
    setup: 10000,
  },
  {
    code: "pro",
    name: "Pro",
    monthly: 5980,
    original: 3980,
    setup: 10000,
  },
] as const;

export function isRecommendedSubscriptionPlan(code: string) {
  return code.toLowerCase() === recommendedSubscriptionPlanCode;
}

export function formatOfficialJPY(
  value: number,
  language: OfficialLanguage = defaultOfficialLanguage,
) {
  return new Intl.NumberFormat(getOfficialLanguageOption(language).locale, {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}
